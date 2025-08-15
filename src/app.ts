import { logger, setLogLevel } from "./logger";
import { loadConfig, findConfigPath, watchConfig, AppConfig } from "./config";
import type { PageConfig, TransformConfig } from "./config";
import { Router } from "./router";
import { ConsoleDriver } from "./drivers/consoleDriver";
import { VoicemeeterDriver } from "./drivers/voicemeeter";
import { QlcDriver } from "./drivers/qlc";
import { ObsDriver } from "./drivers/obs";
import { formatDecoded } from "./midi/decoder";
import { human, hex } from "./midi/utils";
import { XTouchDriver } from "./xtouch/driver";
import { Input } from "@julusian/midi";
import { findPortIndexByNameFragment } from "./midi/ports";
// import { applyReverseTransform } from "./midi/transform";
import { MidiBridgeDriver } from "./drivers/midiBridge";
import type { PagingConfig } from "./config";
import { VoicemeeterSync } from "./apps/voicemeeterSync";
import { applyLcdForActivePage } from "./ui/lcd";
import { attachCli } from "./cli";
import { promises as fs } from "fs";
import path from "path";

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
  // Exposer pour les bridges (anti-echo côté app)
  (global as any).__router__ = router;

  // Journal/snapshot: init persistance légère (append-only + snapshots périodiques)
  const stateDir = path.resolve(process.cwd(), ".state");
  const journalPath = path.join(stateDir, "journal.log");
  const snapshotPath = path.join(stateDir, "snapshot.json");
  try { await fs.mkdir(stateDir, { recursive: true }); } catch {}
  const stateRef = (router as any).state as import("./state").StateStore | undefined;
  const persistQueue: string[] = [];
  let writing = false;
  async function flushJournal() {
    if (writing || persistQueue.length === 0) return;
    writing = true;
    try {
      const chunk = persistQueue.splice(0, persistQueue.length).join("");
      await fs.appendFile(journalPath, chunk, { encoding: "utf8" });
    } catch {}
    writing = false;
  }
  function onStateUpsert(entry: import("./state").MidiStateEntry, app: import("./state").AppKey) {
    const rec = { op: "upsert", app, addr: entry.addr, value: entry.value, ts: entry.ts, origin: entry.origin, known: entry.known };
    persistQueue.push(JSON.stringify(rec) + "\n");
    flushJournal().catch(() => {});
  }
  let unsubState = () => {};
  if (stateRef && typeof stateRef.subscribe === "function") {
    unsubState = stateRef.subscribe(onStateUpsert);
  }
  // Snapshot périodique toutes 5s (compact RAM)
  const snapshotTimer = setInterval(async () => {
    try {
      const dump: any = {};
      for (const app of ["voicemeeter","qlc","obs","midi-bridge"]) {
        dump[app] = stateRef?.listStatesForApp(app as any) ?? [];
      }
      await fs.writeFile(snapshotPath, JSON.stringify({ ts: Date.now(), apps: dump }), { encoding: "utf8" });
    } catch {}
  }, 5000);

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
      // Reconfigurer les listeners background après reload
      try { rebuildBackgroundListeners(router.getActivePage()); } catch {}
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
  // Listeners en arrière-plan pour capter le feedback des apps hors page active
  const backgroundInputs = new Map<string, { inp: Input; appKey: string }>();
  const bgRetryTimers = new Map<string, { count: number; timer: NodeJS.Timeout }>();

  const resolveAppKeyInternal = (toPort: string, fromPort: string): string => {
    const to = (toPort || "").toLowerCase();
    const from = (fromPort || "").toLowerCase();
    const txt = `${to} ${from}`;
    if (txt.includes("qlc")) return "qlc";
    if (txt.includes("xtouch-gw") || txt.includes("voicemeeter")) return "voicemeeter";
    if (txt.includes("obs")) return "obs";
    return "midi-bridge";
  };

  const scheduleBgRetry = (from: string, info: { appKey: string; transform?: TransformConfig }) => {
    const prev = bgRetryTimers.get(from);
    const nextCount = (prev?.count ?? 0) + 1;
    if (nextCount > 5) {
      logger.warn(`Background listener retry abandonné '${from}' après ${nextCount - 1} tentatives.`);
      return;
    }
    if (prev) {
      try { clearTimeout(prev.timer); } catch {}
    }
    const timer = setTimeout(() => {
      try {
        const inp = new Input();
        const idx = findPortIndexByNameFragment(inp, from);
        if (idx == null) {
          inp.closePort?.();
          logger.warn(`Background listener (retry): port IN introuvable '${from}'.`);
          scheduleBgRetry(from, info);
          return;
        }
        inp.ignoreTypes(false, false, false);
        const transform = info.transform;
        inp.on("message", (_delta, data) => {
          try {
            try { logger.debug(`Background RX <- ${from}: ${human(data)} [${hex(data)}] (app=${info.appKey})`); } catch {}
            router.onMidiFromApp(info.appKey, data, from);
          } catch (err) {
            logger.debug("Background listener error:", err as any);
          }
        });
        inp.openPort(idx);
        backgroundInputs.set(from, { inp, appKey: info.appKey });
        try { logger.info(`Background listener ON (retry ${nextCount}): '${from}'.`); } catch {}
        // Clear retry timer on success
        const cur = bgRetryTimers.get(from);
        if (cur) {
          try { clearTimeout(cur.timer); } catch {}
          bgRetryTimers.delete(from);
        }
      } catch (err) {
        logger.warn(`Background listener retry failed '${from}':`, err as any);
        scheduleBgRetry(from, info);
      }
    }, Math.min(2000, 200 * nextCount));
    bgRetryTimers.set(from, { count: nextCount, timer });
    logger.info(`Background listener RETRY ${nextCount}: '${from}' dans ${Math.min(2000, 200 * nextCount)}ms.`);
  };

  const rebuildBackgroundListeners = (activePage: PageConfig | undefined) => {
    // Ports 'from' utilisés par la page active (à ne pas écouter en doublon)
    const activeFroms = new Set<string>();
    const itemsActive = (activePage as any)?.passthroughs ?? ((activePage as any)?.passthrough ? [(activePage as any).passthrough] : []);
    for (const it of (itemsActive as any[])) {
      if (it?.from_port) activeFroms.add(it.from_port);
    }
    // Construire la cible: tous les from_ports des autres pages
    const desired = new Map<string, { appKey: string; transform?: TransformConfig }>();
    for (const p of cfg.pages ?? []) {
      const items = (p as any).passthroughs ?? ((p as any).passthrough ? [(p as any).passthrough] : []);
      for (const it of (items as any[])) {
        const from = it?.from_port;
        if (!from || activeFroms.has(from)) continue;
        if (!desired.has(from)) desired.set(from, { appKey: resolveAppKeyInternal(it?.to_port, from), transform: it?.transform });
      }
    }
    // Fermer les obsolètes
    for (const [from, h] of backgroundInputs) {
      if (!desired.has(from)) {
        try { h.inp.closePort(); } catch {}
        backgroundInputs.delete(from);
        logger.info(`Background listener OFF: '${from}'.`);
      }
    }
    // Ouvrir les nouveaux
    for (const [from, info] of desired) {
      if (backgroundInputs.has(from)) continue;
      try {
        const inp = new Input();
        const idx = findPortIndexByNameFragment(inp, from);
        if (idx == null) {
          inp.closePort?.();
          logger.warn(`Background listener: port IN introuvable '${from}'.`);
          scheduleBgRetry(from, info);
          continue;
        }
        inp.ignoreTypes(false, false, false);
        const transform = info.transform;
        inp.on("message", (_delta, data) => {
          try {
            try { logger.debug(`Background RX <- ${from}: ${human(data)} [${hex(data)}] (app=${info.appKey})`); } catch {}
            router.onMidiFromApp(info.appKey, data, from);
          } catch (err) {
            logger.debug("Background listener error:", err as any);
          }
        });
        inp.openPort(idx);
        backgroundInputs.set(from, { inp, appKey: info.appKey });
        logger.info(`Background listener ON: '${from}'.`);
      } catch (err) {
        logger.warn(`Background listener open failed '${from}':`, err as any);
        scheduleBgRetry(from, info);
      }
    }
  };
  try {
    xtouch = new XTouchDriver({
      inputName: cfg.midi.input_port,
      outputName: cfg.midi.output_port,
    }, { echoPitchBend: false, echoButtonsAndEncoders: true });
    xtouch.start();

    const x = xtouch as import("./xtouch/driver").XTouchDriver; // non-null après start
    router.attachXTouch(x, { interMsgDelayMs: 0 });
    applyLcdForActivePage(router, x);

    const paging: Required<PagingConfig> = {
      channel: cfg.paging?.channel ?? 1,
      prev_note: cfg.paging?.prev_note ?? 46,
      next_note: cfg.paging?.next_note ?? 47,
    } as any;

    const resolveAppKeyForBridge = (toPort: string, fromPort: string): string => {
      const to = (toPort || "").toLowerCase();
      const from = (fromPort || "").toLowerCase();
      const txt = `${to} ${from}`;
      if (txt.includes("qlc")) return "qlc";
      if (txt.includes("xtouch-gw") || txt.includes("voicemeeter")) return "voicemeeter";
      if (txt.includes("obs")) return "obs";
      return "midi-bridge";
    };

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
        if (vel <= 0) return;
        if (note !== paging.prev_note && note !== paging.next_note) return; // Ne naviguer que sur les touches dédiées
        if (now < navCooldownUntil) return;
        const goingPrev = note === paging.prev_note;
        const goingNext = note === paging.next_note;
        if (!goingPrev && !goingNext) return;
        if (goingPrev) router.prevPage();
        if (goingNext) router.nextPage();
        navCooldownUntil = now + 250; // anti-bounce après changement de page
        applyLcdForActivePage(router, x);
        const page = router.getActivePage();
        // Mettre à jour les listeners background AVANT d'ouvrir les bridges de page
        rebuildBackgroundListeners(page);
        // (Re)créer le bridge de page si besoin
        if (page?.passthrough || page?.passthroughs) {
          // Fermer anciens bridges
          for (const b of pageBridges) {
            try { b.shutdown().catch((err) => logger.warn("Bridge shutdown error:", err as any)); } catch {}
          }
          pageBridges = [];
          const items = page.passthroughs ?? (page.passthrough ? [page.passthrough] : []);
          for (const item of items) {
            const appKey = resolveAppKeyForBridge(item.to_port, item.from_port);
            const b = new MidiBridgeDriver(
              x,
              item.to_port,
              item.from_port,
              item.filter,
              item.transform,
              true,
              (appKey2, raw, portId) => router.onMidiFromApp(appKey2, raw, portId)
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
        // Listeners background déjà mis à jour plus haut
        // Snapshot ciblé si voicemeeter
        if (cfg.features?.vm_sync !== false) {
          vmSync?.startSnapshotForPage(page?.name ?? "");
        }
        // Rejouer l'état connu après (ré)initialisation des bridges et listeners
        try { router.refreshPage(); } catch {}
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
      }, (appKey2, raw, portId) => router.onMidiFromApp(appKey2, raw, portId));
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
        const appKey = resolveAppKeyForBridge(item.to_port, item.from_port);
        const b = new MidiBridgeDriver(
          x,
          item.to_port,
          item.from_port,
          item.filter,
          item.transform,
          true,
          (appKey2, raw, portId) => router.onMidiFromApp(appKey2, raw, portId)
        );
        pageBridges.push(b);
        await b.init();
      }
    }
    // Initialiser les listeners background au démarrage
    rebuildBackgroundListeners(initialPage);
    // Forcer un refresh après l'init pour rejouer l'état connu
    try { router.refreshPage(); } catch {}

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

  let isCleaningUp = false;
  const cleanup = () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    logger.info("Arrêt XTouch GW");
    try { clearInterval(snapshotTimer); } catch {}
    try { unsubState(); } catch {}
    try { stopWatch(); } catch {}
    try { for (const b of pageBridges) b.shutdown().catch(() => {}); } catch {}
    try { vmBridge?.shutdown(); } catch {}
    try { vmSync?.stop(); } catch {}
    try { xtouch?.stop(); } catch {}
    try { for (const h of backgroundInputs.values()) { h.inp.closePort(); } } catch {}
    process.exit(0);
  };

  const onSig = () => {
    try { detachCli(); } catch {}
    cleanup();
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception:", err as any);
    cleanup();
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection:", reason as any);
    cleanup();
  });

  return cleanup;
}
