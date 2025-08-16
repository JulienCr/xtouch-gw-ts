import readline from "readline";
import { logger } from "../logger";
import type { Router } from "../router";
import type { XTouchDriver } from "../xtouch/driver";
import { MidiInputSniffer, listInputPorts } from "../midi/sniffer";
import { testMidiSend } from "../test-midi-send";
import { formatDecoded } from "../midi/decoder";

export interface CliContext {
  router: Router;
  xtouch: XTouchDriver | null;
  onExit?: () => Promise<void> | void;
}

export function attachCli(ctx: CliContext): () => void {
  let midiSniffer: MidiInputSniffer | null = null;
  let pendingLearnControlId: string | null = null;

  const toHex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");

  const ensureSniffer = () => {
    if (!midiSniffer) {
      midiSniffer = new MidiInputSniffer((evt) => {
        logger.debug(`MIDI IN: ${toHex(evt.bytes)} (Δ=${evt.deltaSeconds.toFixed(3)}s)`);
        logger.info(formatDecoded(evt.decoded));

        if (pendingLearnControlId) {
          const learnedFor = pendingLearnControlId;
          pendingLearnControlId = null;
          const d = evt.decoded as any;
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

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  logger.info("CLI: commandes → 'page <idx|name>', 'emit <controlId> [value]', 'pages', 'midi-ports', 'midi-open <idx|name>', 'midi-close', 'learn <id>', 'fader <ch> <0..16383>', 'xtouch-stop', 'xtouch-start', 'lcd <strip0-7> <upper> [lower]', 'latency:report', 'latency:reset', 'test-midi [all|custom|buttons|faders]', 'help', 'exit|quit'");
  rl.setPrompt("app> ");
  rl.prompt();

  rl.on("line", async (line) => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    try {
      switch (cmd) {
        case "page": {
          const arg = rest.join(" ");
          const n = Number(arg);
          const ok = Number.isFinite(n) ? ctx.router.setActivePage(n) : ctx.router.setActivePage(arg);
          if (!ok) logger.warn("Page inconnue.");
          break;
        }
        case "pages": {
          logger.info("Pages:", ctx.router.listPages().join(", "));
          break;
        }
        case "emit": {
          const controlId = rest[0];
          const valueRaw = rest[1];
          const value = valueRaw !== undefined ? Number(valueRaw) : undefined;
          await ctx.router.handleControl(controlId, Number.isFinite(value as number) ? value : valueRaw);
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
          if (!ctx.xtouch) {
            logger.info("X-Touch déjà stoppé.");
            break;
          }
          ctx.xtouch.stop();
          ctx.xtouch = null as any;
          logger.info("X-Touch stoppé (ports libérés). Vous pouvez utiliser 'midi-open'.");
          break;
        }
        case "xtouch-start": {
          logger.info("Redémarrage X-Touch non supporté par la CLI extraite (nécessite la config courante). Utilisez le redémarrage de l'app.");
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
          if (!ctx.xtouch) {
            logger.warn("X-Touch non connecté (vérifiez config.yaml et le câblage)");
            break;
          }
          ctx.xtouch.setFader14(ch, v);
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
          if (!ctx.xtouch) {
            logger.warn("X-Touch non connecté");
            break;
          }
          ctx.xtouch.sendLcdStripText(strip, upper, lower);
          logger.info(`LCD[${strip}] ← '${upper}' | '${lower}'`);
          break;
        }
        case "sevenseg":
        case "time": {
          const text = rest.join(" ") || "";
          if (!ctx.xtouch) {
            logger.warn("X-Touch non connecté");
            break;
          }
          ctx.xtouch.setSevenSegmentText(text);
          logger.info(`7-seg ← '${text}'`);
          break;
        }
        case "help":
          logger.info("help: page <idx|name> | pages | emit <controlId> [value] | midi-ports | midi-open <idx|name> | midi-close | learn <id> | fader <ch> <0..16383> | latency:report | latency:reset | exit|quit");
          break;
        case "latency:report": {
          const rpt = (ctx.router as any).getLatencyReport?.();
          if (!rpt) {
            logger.warn("Latence: fonctionnalité non disponible.");
            break;
          }
          for (const app of Object.keys(rpt)) {
            const s = (rpt as any)[app];
            const line = (k: string) => {
              const it = s[k];
              return `${k}: n=${it.count} p50=${it.p50}ms p95=${it.p95}ms max=${it.max}ms last=${it.last}ms`;
            };
            logger.info(`[${app}] ${line("note")} | ${line("cc")} | ${line("pb")} | ${line("sysex")}`);
          }
          break;
        }
        case "latency:reset": {
          if (typeof (ctx.router as any).resetLatency === "function") (ctx.router as any).resetLatency();
          logger.info("Latence: compteurs réinitialisés.");
          break;
        }
        case "test-midi": {
          const which = (rest[0] || "all").toLowerCase();
          // Forcer le mode via param pour éviter les interférences d'environnement
          logger.info(`Test MIDI → ${which}`);
          try {
            await testMidiSend(ctx.xtouch || undefined, { testMode: which as any });
          } catch (e) {
            logger.error("Erreur test-midi:", e as any);
          }
          break;
        }
        case "exit":
        case "quit":
          try { await ctx.onExit?.(); } catch {}
          if (!ctx.onExit) {
            try { rl.close(); } catch {}
            try { process.exit(0); } catch {}
          }
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
    try { midiSniffer?.close(); } catch {}
    try { const p = ctx.onExit?.(); if (p && typeof (p as any).then === "function") { (p as Promise<void>).catch(() => {}); } } catch {}
  });

  return () => {
    rl.close();
  };
}


