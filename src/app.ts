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
  const drivers = [new ConsoleDriver(), new VoicemeeterDriver(), new QlcDriver(), new ObsDriver()];
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
  logger.info("CLI: commandes → 'page <idx|name>', 'emit <controlId> [value]', 'pages', 'midi-ports', 'midi-open <idx|name>', 'midi-close', 'learn <id>', 'help', 'exit'");
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
        case "help":
          logger.info("help: page <idx|name> | pages | emit <controlId> [value] | midi-ports | midi-open <idx|name> | midi-close | learn <id> | exit");
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
    process.exit(0);
  });

  return () => {
    rl.close();
  };
}
