import readline from "readline";
import { logger, setLogLevel } from "./logger";
import { loadConfig, findConfigPath, watchConfig, AppConfig } from "./config";
import { Router } from "./router";
import { ConsoleDriver } from "./drivers/consoleDriver";
import { VoicemeeterDriver } from "./drivers/voicemeeter";
import { QlcDriver } from "./drivers/qlc";
import { ObsDriver } from "./drivers/obs";
import { MidiInputSniffer, listInputPorts } from "./midi/sniffer";
import { formatDecoded } from "./midi/decoder";
import { XTouchDriver } from "./xtouch/driver";
import { MidiBridgeDriver } from "./drivers/midiBridge";
import type { PagingConfig } from "./config";

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

export async function startApp(): Promise<() => void> {
  const envLevel = (process.env.LOG_LEVEL as any) || "info";
  setLogLevel(envLevel);

  logger.info("Démarrage XTouch GW…");
  const configPath = await findConfigPath();
  if (!configPath) {
    throw new Error("config.yaml introuvable. Copiez config.example.yaml → config.yaml");
  }

  let cfg: AppConfig = await loadConfig(configPath);
  const router = new Router(cfg);

  // Enregistrer et initialiser les drivers
  const drivers = [new ConsoleDriver(), new QlcDriver(), new ObsDriver()];
  for (const d of drivers) {
    router.registerDriver(d.name, d);
    await d.init();
  }

  // Hot reload config
  const stopWatch = watchConfig(
    configPath,
    async (next) => {
      cfg = next;
      await router.updateConfig(next);
    },
    (err) => logger.warn("Erreur hot reload config:", err as any)
  );

  // Sélection page par défaut
  if (cfg.pages.length > 0) {
    router.setActivePage(0);
  }

  // X-Touch: ouvrir les ports définis dans config.yaml
  let xtouch: XTouchDriver | null = null;
  let vmBridge: VoicemeeterDriver | null = null;
  let pageBridge: MidiBridgeDriver | null = null;
  try {
    xtouch = new XTouchDriver({
      inputName: cfg.midi.input_port,
      outputName: cfg.midi.output_port,
    }, { echoPitchBend: true });
    xtouch.start();

    const x = xtouch as import("./xtouch/driver").XTouchDriver; // non-null après start
    // Afficher la page active au démarrage
    x.sendLcdStripText(0, router.getActivePageName());

    const paging: Required<PagingConfig> = {
      channel: cfg.paging?.channel ?? 1,
      prev_note: cfg.paging?.prev_note ?? 46,
      next_note: cfg.paging?.next_note ?? 47,
    } as any;

    // Navigation de pages via NoteOn
    const unsubNav = xtouch.subscribe((_delta, data) => {
      const status = data[0] ?? 0;
      const type = (status & 0xf0) >> 4;
      const ch = (status & 0x0f) + 1;
      if (type === 0x9 && ch === paging.channel) {
        const note = data[1] ?? 0;
        const vel = data[2] ?? 0;
        if (vel > 0) {
          if (note === paging.prev_note) router.prevPage();
          if (note === paging.next_note) router.nextPage();
          const page = router.getActivePage();
          // Update LCD avec le nom de la page
          x.sendLcdStripText(0, page?.name ?? "");
          // (Re)créer le bridge de page si besoin
          if (page?.passthrough) {
            pageBridge?.shutdown();
            pageBridge = new MidiBridgeDriver(
              xtouch!,
              page.passthrough.to_port,
              page.passthrough.from_port
            );
            pageBridge.init().catch((err) => logger.warn("Bridge page init error:", err as any));
          } else {
            pageBridge?.shutdown();
            pageBridge = null;
          }
        }
      }
    });

    // Si aucune page ne définit de passthrough, activer le bridge global vers Voicemeeter
    const hasPagePassthrough = (cfg.pages ?? []).some((p) => !!p.passthrough);
    if (!hasPagePassthrough) {
      vmBridge = new VoicemeeterDriver(xtouch, {
        toVoicemeeterOutName: "xtouch-gw",
        fromVoicemeeterInName: "xtouch-gw-feedback",
      });
      await vmBridge.init();
      logger.info("Mode bridge global Voicemeeter actif (aucun passthrough par page détecté).");
    } else {
      logger.info("Mode passthrough par page actif (bridge global désactivé).");
    }

    // Initialiser bridge pour page active si défini
    const initialPage = router.getActivePage();
    if (initialPage?.passthrough) {
      pageBridge = new MidiBridgeDriver(
        xtouch!,
        initialPage.passthrough.to_port,
        initialPage.passthrough.from_port
      );
      await pageBridge.init();
    }
  } catch (err) {
    logger.warn("X-Touch/Voicemeeter non connecté:", (err as any)?.message ?? err);
  }

  // MIDI Sniffer
  let midiSniffer: MidiInputSniffer | null = null;
  let pendingLearnControlId: string | null = null;
  const ensureSniffer = () => {
    if (!midiSniffer) {
      midiSniffer = new MidiInputSniffer((evt) => {
        // Log lisible (info) + brut en debug
        logger.debug(`MIDI IN: ${toHex(evt.bytes)} (Δ=${evt.deltaSeconds.toFixed(3)}s)`);
        logger.info(formatDecoded(evt.decoded));

        // Mode learn: capture le prochain événement
        if (pendingLearnControlId) {
          const learnedFor = pendingLearnControlId;
          pendingLearnControlId = null;
          const d = evt.decoded as any;
          // Construire une clé détecteur et un id suggéré
          let detector = "";
          let suggestedId = learnedFor;
          if (d.type === "pitchBend") {
            detector = `pb:${d.channel}`;
            if (/^fader\d+$/.test(learnedFor) === false && d.channel) {
              suggestedId = `fader${d.channel}`;
            }
          } else if (d.type === "controlChange") {
            detector = `cc:${d.channel}:${d.controller}`;
            if (/^enc(oder)?\d+/.test(learnedFor) === false) {
              suggestedId = d.channel && d.channel !== 1 ? `enc${d.controller}_ch${d.channel}` : `enc${d.controller}`;
            }
          } else if (d.type === "noteOn" || d.type === "noteOff") {
            detector = `note:${d.channel}:${d.note}`;
            if (/^button\d+/.test(learnedFor) === false) {
              suggestedId = d.channel && d.channel !== 1 ? `button${d.note}_ch${d.channel}` : `button${d.note}`;
            }
          } else {
            detector = d.type;
          }

          const yamlLine = `${suggestedId}: { app: "console", action: "log", params: [] }`;
          logger.info("LEARN →", formatDecoded(evt.decoded));
          logger.info("Proposition controlId:", suggestedId);
          logger.info("Détecteur:", detector);
          logger.info("YAML:");
          logger.info(yamlLine);
        }
      });
    }
    return midiSniffer;
  };

  // CLI de développement
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  logger.info("CLI: commandes → 'page <idx|name>', 'emit <controlId> [value]', 'pages', 'midi-ports', 'midi-open <idx|name>', 'midi-close', 'learn <id>', 'fader <ch> <0..16383>', 'xtouch-stop', 'xtouch-start', 'lcd <strip0-7> <upper> [lower]', 'help', 'exit'");
  rl.setPrompt("app> ");
  rl.prompt();

  rl.on("line", async (line) => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    try {
      switch (cmd) {
        case "page": {
          const arg = rest.join(" ");
          const n = Number(arg);
          const ok = Number.isFinite(n) ? router.setActivePage(n) : router.setActivePage(arg);
          if (!ok) logger.warn("Page inconnue.");
          break;
        }
        case "pages": {
          logger.info("Pages:", router.listPages().join(", "));
          break;
        }
        case "emit": {
          const controlId = rest[0];
          const valueRaw = rest[1];
          const value = valueRaw !== undefined ? Number(valueRaw) : undefined;
          await router.handleControl(controlId, Number.isFinite(value as number) ? value : valueRaw);
          break;
        }
        case "midi-ports": {
          const ports = listInputPorts();
          if (ports.length === 0) {
            logger.info("Aucun port MIDI d'entrée détecté.");
          } else {
            for (const p of ports) logger.info(`[${p.index}] ${p.name}`);
          }
          break;
        }
        case "midi-open": {
          const arg = rest.join(" ");
          if (!arg) {
            logger.warn("Usage: midi-open <idx|name>");
            break;
          }
          const n = Number(arg);
          const snif = ensureSniffer();
          if (Number.isFinite(n)) {
            snif.openByIndex(n);
          } else {
            const ok = snif.openByName(arg);
            if (!ok) logger.warn("Port non trouvé par nom.");
          }
          break;
        }
        case "midi-close": {
          midiSniffer?.close();
          break;
        }
        case "xtouch-stop": {
          if (!xtouch) {
            logger.info("X-Touch déjà stoppé.");
            break;
          }
          xtouch.stop();
          xtouch = null;
          logger.info("X-Touch stoppé (ports libérés). Vous pouvez utiliser 'midi-open'.");
          break;
        }
        case "xtouch-start": {
          if (xtouch) {
            logger.info("X-Touch déjà démarré.");
            break;
          }
          try {
            xtouch = new XTouchDriver({
              inputName: cfg.midi.input_port,
              outputName: cfg.midi.output_port,
            });
            xtouch.start();
          } catch (err) {
            logger.error("Impossible de démarrer X-Touch:", err as any);
          }
          break;
        }
        case "learn": {
          const id = rest.join(" ");
          if (!id) {
            logger.warn("Usage: learn <id>");
            break;
          }
          if (!midiSniffer) {
            logger.warn("Ouvrez un port d'entrée d'abord: 'midi-ports' puis 'midi-open <idx|name>'");
            break;
          }
          pendingLearnControlId = id;
          logger.info(`Learn armé pour '${id}'. Touchez un contrôle sur la X-Touch…`);
          break;
        }
        case "fader": {
          const ch = Number(rest[0]);
          const v = Number(rest[1]);
          if (!Number.isFinite(ch) || !Number.isFinite(v)) {
            logger.warn("Usage: fader <ch> <0..16383>");
            break;
          }
          if (!xtouch) {
            logger.warn("X-Touch non connecté (vérifiez config.yaml et le câblage)");
            break;
          }
          xtouch.setFader14(ch, v);
          logger.info(`Fader ${ch} ← ${v}`);
          break;
        }
        case "lcd": {
          const strip = Number(rest[0]);
          const upper = rest[1];
          const lower = rest.slice(2).join(" ") || "";
          if (!Number.isFinite(strip) || !upper) {
            logger.warn("Usage: lcd <strip0-7> <upper> [lower]");
            break;
          }
          if (!xtouch) {
            logger.warn("X-Touch non connecté");
            break;
          }
          xtouch.sendLcdStripText(strip, upper, lower);
          logger.info(`LCD[${strip}] ← '${upper}' | '${lower}'`);
          break;
        }
        case "help":
          logger.info("help: page <idx|name> | pages | emit <controlId> [value] | midi-ports | midi-open <idx|name> | midi-close | learn <id> | fader <ch> <0..16383> | exit");
          break;
        case "exit":
          rl.close();
          break;
        default:
          if (cmd.length > 0) logger.warn("Commande inconnue. Tapez 'help'.");
      }
    } catch (err) {
      logger.error("Erreur CLI:", err as any);
    } finally {
      rl.prompt();
    }
  });

  const onSig = () => {
    rl.close();
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  rl.on("close", () => {
    logger.info("Arrêt XTouch GW");
    stopWatch();
    midiSniffer?.close();
    pageBridge?.shutdown();
    vmBridge?.shutdown();
    xtouch?.stop();
    process.exit(0);
  });

  return () => {
    rl.close();
  };
}
