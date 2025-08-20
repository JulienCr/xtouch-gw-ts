import readline from "readline";
import { logger } from "../logger";
import { loadHelpSpec, printHelp } from "./help";
import { buildHelpRuntimeContext, suggestFromSpec } from "./helpSupport";
import type { Router } from "../router";
import type { XTouchDriver } from "../xtouch/driver";
import { MidiInputSniffer, listInputPorts } from "../midi/sniffer";
import { testMidiSend } from "../test-midi-send";
import { formatDecoded } from "../midi/decoder";
import { parseCommand } from "../midi/testDsl";
import * as xtapi from "../xtouch/api";

export interface CliContext {
  router: Router;
  xtouch: XTouchDriver | null;
  onExit?: () => Promise<void> | void;
}

export function attachCli(ctx: CliContext): () => void {
  let midiSniffer: MidiInputSniffer | null = null;
  let pendingLearnControlId: string | null = null;

  const toHex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");

  /**
   * Effacer l'écran et l'historique de scroll du terminal (sans logger).
   * Utilise des séquences ANSI compatibles Windows Terminal/PowerShell 7+.
   */
  const clearConsole = () => {
    try {
      // Efface écran + scrollback et remet le curseur en haut à gauche
      process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
    } catch {}
  };

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
  try {
    const spec = loadHelpSpec();
    const runtime = buildHelpRuntimeContext(ctx);
    printHelp(spec, runtime);
  } catch (err) {
    process.stdout.write("Aide CLI indisponible (help.yaml introuvable ou invalide). Tapez 'help'.\n");
  }
  rl.setPrompt("app> ");
  rl.prompt();

  rl.on("line", async (line) => {
    const [rawCmd, ...rest] = line.trim().split(/\s+/);
    const cmd = rawCmd === "-h" || rawCmd === "--help" ? "help" : (rawCmd === "-v" || rawCmd === "--version" ? "version" : rawCmd);
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
        case "midi:ports":
        case "midi-ports": {
          const ports = listInputPorts();
          if (ports.length === 0) {
            logger.info("Aucun port MIDI d'entrée détecté.");
          } else {
            for (const p of ports) logger.info(`[${p.index}] ${p.name}`);
          }
          break;
        }
        case "midi:open":
        case "midi-open": {
          const arg = rest.join(" ");
          if (!arg) {
            logger.warn("Usage: midi:open <idx|name>");
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
        case "midi:close":
        case "midi-close": {
          midiSniffer?.close();
          break;
        }
        case "xtouch:stop":
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
        case "send": {
          if (!ctx.xtouch) {
            logger.warn("X-Touch non connecté");
            break;
          }
          const cmdLine = rest.join(" ");
          if (!cmdLine) {
            logger.warn("Usage: send <command>");
            logger.info("Exemples (support décimal, hex 0x, et hex avec suffixe n):");
            logger.info("  send noteon ch=1 note=118 velocity=127");
            logger.info("  send noteon ch=1 note=0x76 velocity=0x7F");
            logger.info("  send noteon ch=1 note=0x1n velocity=0x1n");
            logger.info("  send noteoff ch=1 note=0x76");
            logger.info("  send cc ch=1 cc=0x10 value=0x40");
            logger.info("  send pb ch=1 value=8192");
            logger.info("  send raw 90 76 7F");
            break;
          }
          
          // Mode raw pour les messages hex bruts
          if (cmdLine.startsWith("raw ")) {
            const hexBytes = cmdLine.substring(4).split(/\s+/);
            const bytes: number[] = [];
            let valid = true;
            for (const hex of hexBytes) {
              const byte = parseInt(hex, 16);
              if (!Number.isFinite(byte) || byte < 0 || byte > 255) {
                logger.warn(`Octet invalide: ${hex} (attendu: 00..FF)`);
                valid = false;
                break;
              }
              bytes.push(byte);
            }
            if (valid && bytes.length > 0) {
              ctx.xtouch.sendRawMessage(bytes);
              logger.info(`MIDI → Raw (${bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')})`);
            }
            break;
          }

          // Utiliser parseCommand pour les autres commandes
          const parsed = parseCommand(cmdLine, { defaultDelayMs: 0, noteOffAsNoteOn0: false });
          if (!parsed) {
            logger.warn("Commande non reconnue");
            logger.info("Formats supportés: noteon, noteoff, cc, raw");
            break;
          }
          
          if (parsed.kind === "Wait") {
            logger.warn("Wait non supporté dans send (utilisez test-midi)");
            break;
          }
          
          if (parsed.kind === "Raw") {
            ctx.xtouch.sendRawMessage(parsed.bytes);
            logger.info(`MIDI → ${parsed.label} (${parsed.bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')})`);
          }
          break;
        }
        case "reset": {
          if (!ctx.xtouch) {
            logger.warn("X-Touch non connecté");
            break;
          }
          logger.info("Reset de la surface X-Touch...");
          try {
            await xtapi.resetAll(ctx.xtouch, { clearLcds: true });
            logger.info("Reset terminé");
          } catch (err) {
            logger.error("Erreur lors du reset:", err as any);
          }
          break;
        }
        case "sync": {
          // 1) Reset X-Touch
          if (ctx.xtouch) {
            logger.info("Reset de la surface X-Touch...");
            try { await xtapi.resetAll(ctx.xtouch, { clearLcds: true }); logger.info("Reset terminé"); } catch (err) { logger.error("Erreur lors du reset:", err as any); }
          } else {
            logger.warn("X-Touch non connectée, reset ignoré");
          }

          // 2) Recharger les états depuis le snapshot
          logger.info("Rechargement des états depuis le snapshot...");
          try {
            const stateRef = (ctx.router as any).state;
            if (stateRef && typeof stateRef.hydrateFromSnapshot === "function") {
              const fs = await import("fs/promises");
              const path = await import("path");
              const snapshotPath = path.resolve(process.cwd(), ".state", "snapshot.json");
              try {
                const raw = await fs.readFile(snapshotPath, { encoding: "utf8" });
                const snap = JSON.parse(raw) as { ts?: number; apps?: Record<string, any[]> };
                const apps = ["voicemeeter", "qlc", "obs", "midi-bridge"] as const;
                if (snap && snap.apps) {
                  for (const app of apps) {
                    const entries = Array.isArray((snap.apps as any)[app]) ? (snap.apps as any)[app] : [];
                    if (entries.length > 0) {
                      stateRef.hydrateFromSnapshot(app, entries);
                      logger.info(`État rechargé pour ${app}: ${entries.length} entrées`);
                    }
                  }
                  logger.info("Rechargement terminé");
                } else {
                  logger.warn("Snapshot vide ou absent");
                }
              } catch (err) {
                logger.warn("Aucun snapshot ou lecture impossible:", err as any);
              }
            } else {
              logger.warn("StateStore non accessible");
            }
          } catch (err) {
            logger.error("Erreur lors du rechargement des états:", err as any);
          }

          // 3) Synchroniser les drivers (ex: OBS: scenes, studio mode...)
          try {
            logger.info("Synchronisation des drivers...");
            await ctx.router.syncDrivers();
            logger.info("Drivers synchronisés");
          } catch (err) {
            logger.error("Erreur lors de la synchronisation des drivers:", err as any);
          }

          // 4) Rafraîchir la page active et LCD
          try {
            if (ctx.xtouch) {
              const { applyLcdForActivePage } = await import("../ui/lcd");
              applyLcdForActivePage(ctx.router, ctx.xtouch);
            }
          } catch {}
          try { ctx.router.refreshPage(); } catch {}
          break;
        }
        case "state": {
          const subcmd = rest[0];
          if (subcmd === "load") {
            logger.info("Rechargement des états depuis le snapshot...");
            try {
              // Accéder au StateStore via le router
              const stateRef = (ctx.router as any).state;
              if (stateRef && typeof stateRef.hydrateFromSnapshot === "function") {
                // Recharger depuis le snapshot
                const fs = await import("fs/promises");
                const path = await import("path");
                const snapshotPath = path.resolve(process.cwd(), ".state", "snapshot.json");
                try {
                  const raw = await fs.readFile(snapshotPath, { encoding: "utf8" });
                  const snap = JSON.parse(raw) as { ts?: number; apps?: Record<string, any[]> };
                  const apps = ["voicemeeter", "qlc", "obs", "midi-bridge"] as const;
                  if (snap && snap.apps) {
                                         for (const app of apps) {
                       const entries = Array.isArray((snap.apps as any)[app]) ? (snap.apps as any)[app] : [];
                       if (entries.length > 0) {
                         stateRef.hydrateFromSnapshot(app, entries);
                         logger.info(`État rechargé pour ${app}: ${entries.length} entrées`);
                       }
                     }
                     logger.info("Rechargement terminé");
                     
                     // Synchroniser la X-Touch avec les états rechargés
                     logger.info("Synchronisation de la surface X-Touch...");
                     try {
                       if (ctx.xtouch) {
                         // Déclencher un refresh de la page active pour synchroniser la surface
                         ctx.router.refreshPage();
                         logger.info("Surface synchronisée");
                       } else {
                         logger.warn("X-Touch non connectée, synchronisation impossible");
                       }
                     } catch (err) {
                       logger.error("Erreur lors de la synchronisation:", err as any);
                     }
                     
                     // Recharger la configuration pour remettre les LCD et éléments statiques
                     logger.info("Rechargement de la configuration...");
                     try {
                       // Recharger le fichier config.yaml et mettre à jour le router
                       const fs = await import("fs/promises");
                       const path = await import("path");
                       const configPath = path.resolve(process.cwd(), "config.yaml");
                       try {
                         const raw = await fs.readFile(configPath, { encoding: "utf8" });
                         const YAML = await import("yaml");
                         const newConfig = YAML.parse(raw);
                         
                         if (ctx.router && typeof (ctx.router as any).updateConfig === "function") {
                           await (ctx.router as any).updateConfig(newConfig);
                           logger.info("Configuration rechargée");
                           
                           // Appliquer les LCD de la nouvelle config
                           if (ctx.xtouch) {
                             try {
                               const { applyLcdForActivePage } = await import("../ui/lcd");
                               applyLcdForActivePage(ctx.router, ctx.xtouch);
                               logger.info("LCD mis à jour");
                             } catch (err) {
                               logger.debug("Mise à jour LCD échouée:", err as any);
                             }
                           }
                         } else {
                           logger.warn("Méthode updateConfig non disponible");
                         }
                       } catch (err) {
                         logger.error("Erreur lors de la lecture de config.yaml:", err as any);
                       }
                     } catch (err) {
                       logger.error("Erreur lors du rechargement de la config:", err as any);
                     }
                  } else {
                    logger.warn("Aucun snapshot trouvé");
                  }
                } catch (err) {
                  logger.error("Erreur lors du rechargement:", err as any);
                }
              } else {
                logger.warn("StateStore non accessible");
              }
            } catch (err) {
              logger.error("Erreur lors du rechargement:", err as any);
            }
                     } else if (subcmd === "rm") {
             logger.info("Suppression des états...");
             try {
               const stateRef = (ctx.router as any).state;
               if (stateRef && typeof stateRef.clearAllStates === "function") {
                 stateRef.clearAllStates();
                 logger.info("États en mémoire supprimés");
               } else {
                 // Fallback: vider manuellement chaque app
                 const apps = ["voicemeeter", "qlc", "obs", "midi-bridge"] as const;
                 for (const app of apps) {
                   if (stateRef && typeof stateRef.clearStatesForApp === "function") {
                     stateRef.clearStatesForApp(app);
                   }
                 }
                 logger.info("États en mémoire supprimés (fallback)");
               }
               
               // Supprimer aussi les fichiers de persistance
               logger.info("Suppression des fichiers de persistance...");
               try {
                 const fs = await import("fs/promises");
                 const path = await import("path");
                 const stateDir = path.resolve(process.cwd(), ".state");
                 
                 // Supprimer le snapshot principal
                 const snapshotPath = path.join(stateDir, "snapshot.json");
                 try {
                   await fs.unlink(snapshotPath);
                   logger.info("Snapshot supprimé");
                 } catch (err) {
                   if ((err as any)?.code === 'ENOENT') {
                     logger.info("Snapshot déjà supprimé");
                   } else {
                     logger.warn("Erreur lors de la suppression du snapshot:", err as any);
                   }
                 }
                 
                 // Supprimer le répertoire .state s'il est vide
                 try {
                   const files = await fs.readdir(stateDir);
                   if (files.length === 0) {
                     await fs.rmdir(stateDir);
                     logger.info("Répertoire .state supprimé");
                   }
                 } catch (err) {
                   logger.debug("Impossible de supprimer le répertoire .state:", err as any);
                 }
                 
                 logger.info("Fichiers de persistance supprimés");
               } catch (err) {
                 logger.error("Erreur lors de la suppression des fichiers:", err as any);
               }
               
               // Synchroniser la surface X-Touch (remettre tout à zéro)
               if (ctx.xtouch) {
                 logger.info("Synchronisation de la surface X-Touch...");
                 try {
                   ctx.router.refreshPage();
                   logger.info("Surface synchronisée (états effacés)");
                 } catch (err) {
                   logger.error("Erreur lors de la synchronisation:", err as any);
                 }
               }
               
             } catch (err) {
               logger.error("Erreur lors de la suppression:", err as any);
             }
           } else {
            logger.warn("Usage: state <load|rm>");
            logger.info("  state load - Recharge les états depuis le snapshot");
            logger.info("  state rm  - Supprime tous les états");
          }
          break;
        }
        case "show": {
          const subcmd = rest[0];
          if (subcmd === "pages") {
            const pages = ctx.router.listPages();
            if (pages.length === 0) {
              logger.info("Aucune page configurée");
            } else {
              logger.info("Pages disponibles:");
              for (let i = 0; i < pages.length; i++) {
                const page = ctx.router.getActivePage();
                const isActive = page && page.name === pages[i];
                const marker = isActive ? " → " : "   ";
                logger.info(`${marker}[${i + 1}] ${pages[i]}`);
              }
            }
          } else {
            logger.warn("Usage: show <pages>");
            logger.info("  show pages - Liste les pages avec index (1,2,3...)");
          }
          break;
        }
        case "completion": {
          const target = (rest[0] || "zsh").toLowerCase();
          try {
            const spec = loadHelpSpec();
            if (target === "zsh") {
              const cmds = spec.categories.flatMap((c) => c.commands.map((x) => x.name));
              const aliases = spec.categories.flatMap((c) => c.commands.flatMap((x) => x.aliases || []));
              const all = Array.from(new Set(["help", "exit", ...cmds, ...aliases]));
              const script = `#compdef xtouch-gw\n_arguments '*::command:->cmds'\ncase $state in\n  cmds)\n    _values 'commands' ${all.map((c) => `\\"${c}\\"`).join(" ")};;\n  esac\n`;
              process.stdout.write(script + "\n");
            } else if (target === "bash" || target === "powershell") {
              const all = spec.categories.flatMap((c) => c.commands.map((x) => x.name)).join(" ");
              process.stdout.write(`# Commands:\n${all}\n`);
            } else {
              logger.warn("Shell non supporté. Utilisez: completion <bash|zsh|powershell>");
            }
          } catch (e) {
            logger.warn("Impossible de générer l'autocomplétion:", e as any);
          }
          break;
        }
        case "help": {
          try {
            const spec = loadHelpSpec();
            const runtime = buildHelpRuntimeContext(ctx);
            const arg = rest.join(" ").trim();
            if (arg === "--json" || arg === "json") { printHelp(spec, runtime, { kind: "json" }); break; }
            if (!arg) { printHelp(spec, runtime); break; }
            if (arg === "all") { printHelp(spec, runtime, { kind: "all" }); break; }
            if (arg === "examples") { printHelp(spec, runtime, { kind: "examples" }); break; }
            if (arg.startsWith("search ")) { printHelp(spec, runtime, { kind: "search", value: arg.slice(7) }); break; }
            const cat = spec.categories.find((c) => c.id === arg || c.title.toLowerCase().includes(arg.toLowerCase()));
            if (cat) { printHelp(spec, runtime, { kind: "category", value: cat.id }); break; }
            // Command details
            printHelp(spec, runtime, { kind: "command", value: arg });
          } catch (err) {
            process.stdout.write("Aide CLI indisponible (help.yaml introuvable ou invalide).\n");
          }
          break;
        }
        case "version": {
          try {
            const spec = loadHelpSpec();
            const v = spec.meta?.version || require("../../package.json").version || "0.0.0";
            logger.info(`xtouch-gw ${v}`);
          } catch {
            logger.info("xtouch-gw");
          }
          break;
        }
        case "clear": {
          clearConsole();
          break;
        }
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
        case "test:midi":
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
          if (cmd.length > 0) {
            try {
              const spec = loadHelpSpec();
              const runtime = buildHelpRuntimeContext(ctx);
              const s = suggestFromSpec(spec, cmd);
              logger.warn("Commande inconnue. Tapez 'help'.");
              if (s.length > 0) process.stdout.write(`Suggestions: ${s.join(", ")}\n`);
              printHelp(spec, runtime, { kind: "category", value: "basics" });
            } catch {
              logger.warn("Commande inconnue.");
            }
          }
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

// help-related helpers moved to ./helpSupport


