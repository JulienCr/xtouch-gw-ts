import { logger, setLogLevel } from "./logger";
import { loadConfig, findConfigPath, watchConfig, AppConfig } from "./config";
import { Router } from "./router";
import { ConsoleDriver } from "./drivers/consoleDriver";
import { VoicemeeterDriver } from "./drivers/voicemeeter";
import { QlcDriver } from "./drivers/qlc";
import { ObsDriver } from "./drivers/obs";
import { formatDecoded } from "./midi/decoder";
import { XTouchDriver } from "./xtouch/driver";
import { MidiBridgeDriver } from "./drivers/midiBridge";
import type { PagingConfig } from "./config";
import { VoicemeeterSync } from "./apps/voicemeeterSync";
import { applyLcdForActivePage } from "./ui/lcd";
import { attachCli } from "./cli";

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
      // Réappliquer les LCD si X-Touch actif
      try {
        if (xtouch) {
          const x = xtouch as import("./xtouch/driver").XTouchDriver;
          applyLcdForActivePage(router, x);
        }
      } catch (e) {
        logger.debug("Hot reload LCD refresh skipped:", e as any);
      }
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
  let pageBridges: MidiBridgeDriver[] = [];
  let vmSync: VoicemeeterSync | null = null;
  try {
    xtouch = new XTouchDriver({
      inputName: cfg.midi.input_port,
      outputName: cfg.midi.output_port,
    }, { echoPitchBend: true });
    xtouch.start();

    const x = xtouch as import("./xtouch/driver").XTouchDriver; // non-null après start
    router.attachXTouch(x, { interMsgDelayMs: 1 });
    applyLcdForActivePage(router, x);

    const paging: Required<PagingConfig> = {
      channel: cfg.paging?.channel ?? 1,
      prev_note: cfg.paging?.prev_note ?? 46,
      next_note: cfg.paging?.next_note ?? 47,
    } as any;

    // Navigation de pages via NoteOn (avec anti-rebond)
    let navCooldownUntil = 0;
    const unsubNav = x.subscribe((_delta, data) => {
      const status = data[0] ?? 0;
      const type = (status & 0xf0) >> 4;
      const ch = (status & 0x0f) + 1;
      if (type === 0x9 && ch === paging.channel) {
        const note = data[1] ?? 0;
        const vel = data[2] ?? 0;
        const now = Date.now();
        if (now < navCooldownUntil) return;
        if (vel > 0) {
          if (note === paging.prev_note) router.prevPage();
          if (note === paging.next_note) router.nextPage();
          navCooldownUntil = now + 250; // anti-bounce après changement de page
          applyLcdForActivePage(router, x);
          const page = router.getActivePage();
          // (Re)créer le bridge de page si besoin
          if (page?.passthrough || page?.passthroughs) {
            // Fermer anciens bridges
            for (const b of pageBridges) {
              b.shutdown().catch((err) => logger.warn("Bridge shutdown error:", err as any));
            }
            pageBridges = [];
            const items = page.passthroughs ?? (page.passthrough ? [page.passthrough] : []);
            for (const item of items) {
              const b = new MidiBridgeDriver(
                x,
                item.to_port,
                item.from_port,
                item.filter,
                item.transform,
                true
              );
              pageBridges.push(b);
              b.init().catch((err) => logger.warn("Bridge page init error:", err as any));
            }
          } else {
            for (const b of pageBridges) {
              b.shutdown().catch((err) => logger.warn("Bridge shutdown error:", err as any));
            }
            pageBridges = [];
          }
          // Snapshot ciblé si voicemeeter
          if (cfg.features?.vm_sync !== false) {
            vmSync?.startSnapshotForPage(page?.name ?? "");
          }
        }
      }
    });

    // Si aucune page ne définit de passthrough, activer le bridge global vers Voicemeeter
    const hasPagePassthrough = (cfg.pages ?? []).some(
      (p) => !!p.passthrough || (Array.isArray((p as any).passthroughs) && (p as any).passthroughs.length > 0)
    );
    if (!hasPagePassthrough) {
      vmBridge = new VoicemeeterDriver(x, {
        toVoicemeeterOutName: "xtouch-gw",
        fromVoicemeeterInName: "xtouch-gw-feedback",
      }, (raw) => router.onMidiFromApp("voicemeeter", raw));
      await vmBridge.init();
      logger.info("Mode bridge global Voicemeeter actif (aucun passthrough par page détecté).");
    } else {
      logger.info("Mode passthrough par page actif (bridge global désactivé).");
    }

    // Initialiser bridge pour page active si défini
    const initialPage = router.getActivePage();
    if (initialPage?.passthrough || initialPage?.passthroughs) {
      const items = initialPage.passthroughs ?? (initialPage.passthrough ? [initialPage.passthrough] : []);
      for (const item of items) {
        const b = new MidiBridgeDriver(
          x,
          item.to_port,
          item.from_port,
          item.filter,
          item.transform,
          true,
          (raw) => router.onMidiFromApp("midi-bridge", raw)
        );
        pageBridges.push(b);
        await b.init();
      }
    }

    // Voicemeeter snapshot & dirty loop si activé
    if (cfg.features?.vm_sync !== false) {
      vmSync = new VoicemeeterSync(x);
      await vmSync.startSnapshotForPage(router.getActivePageName());
      vmSync.startDirtyLoop();
    } else {
      logger.info("VM Sync désactivé via configuration.");
    }
  } catch (err) {
    logger.warn("X-Touch/Voicemeeter non connecté:", (err as any)?.message ?? err);
  }

  // CLI de développement
  const detachCli = attachCli({ router, xtouch });

  const onSig = () => {
    detachCli();
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  const cleanup = () => {
    logger.info("Arrêt XTouch GW");
    stopWatch();
    for (const b of pageBridges) b.shutdown().catch(() => {});
    vmBridge?.shutdown();
    vmSync?.stop();
    xtouch?.stop();
    process.exit(0);
  };

  return cleanup;
}
