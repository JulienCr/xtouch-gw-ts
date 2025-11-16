import { logger, setLogLevel } from "./logger";
import { loadConfig, findConfigPath, watchConfig, AppConfig } from "./config";
import { shouldAttachCli } from "./utils/runtime";
import type { PageConfig } from "./config";
import { Router } from "./router";
import { MidiBridgeDriver } from "./drivers/midibridge";
import { attachCli } from "./cli";
import { getPagePassthroughItems } from "./config/passthrough";
import { buildPageBridges } from "./bridges/pageBridges";
import { setupStatePersistence } from "./state/persistence";
import { createBackgroundManager, initDrivers, startXTouchAndNavigation } from "./app/bootstrap";
import { applyLcdForActivePage } from "./ui/lcd";
import { updateFKeyLedsForActivePage } from "./xtouch/fkeys";
import * as xtapi from "./xtouch/api";
import { attachInputMapper } from "./xtouch/inputMapper";
import { attachIndicators, refreshIndicators } from "./xtouch/indicators";
import { initControlMidiSender, shutdownControlMidiSender, updateControlMidiSenderConfig, reconcileControlMidiSenderForPage, setControlMidiSenderXTouch } from "./services/controlMidiSender";
import { attachGamepad } from "./input/gamepad";

// Minimal Node globals typing to satisfy TS without @types/node
declare const process: any;
declare const global: any;

/**
 * Point d'entrée de l'application.
 * - Charge la configuration, instancie le `Router`
 * - Initialise la persistance du `StateStore`
 * - Enregistre les drivers et démarre le X‑Touch + navigation
 * - Active le hot‑reload de la configuration
 *
 * @returns Fonction de nettoyage (arrêt propre des composants)
 */
export async function startApp(): Promise<() => Promise<void>> {
  const envLevel = (process.env.LOG_LEVEL as any) || "info";
  setLogLevel(envLevel);

  logger.info("Démarrage XTouch GW…");
  logger.info("LOG_LEVEL:", process.env.LOG_LEVEL);
  const configPath = await findConfigPath();
  if (!configPath) {
    throw new Error("config.yaml introuvable. Copiez config.example.yaml → config.yaml");
  }

  let cfg: AppConfig = await loadConfig(configPath);
  const router = new Router(cfg);
  // Exposer pour les bridges (anti-echo côté app)
  (global as any).__router__ = router;

  // Persistance légère du state
  const persistence = await setupStatePersistence(router);

  // Enregistrer et initialiser les drivers
  await initDrivers(router);
  // Service d'envoi MIDI par contrôle (ports cache)
  await initControlMidiSender(cfg, { router });

  // Hot reload config
  const stopWatch = watchConfig(
    configPath,
    async (next) => {
      cfg = next;
      await router.updateConfig(next);
      try { await updateControlMidiSenderConfig(next); } catch {}
      // Réappliquer les LCD si X-Touch actif
      try {
        if (xtouch) {
          const x = xtouch as import("./xtouch/driver").XTouchDriver;
          applyLcdForActivePage(router, x);
          // Mettre à jour l'état des LEDs F1..F8 après reload
          try {
            const pagingCh = (cfg.paging?.channel ?? 1) | 0;
            updateFKeyLedsForActivePage(router, x, pagingCh, cfg.xtouch?.mode ?? "mcu");
          } catch {}
          // Rebrancher l'InputMapper générique (mode/canal peuvent changer)
          try { detachInputMapper?.(); } catch {}
          try { detachInputMapper = await attachInputMapper({ router, xtouch: x, mode: cfg.xtouch?.mode ?? "mcu", channel: cfg.paging?.channel ?? 1 }); } catch {}
          // Rebrancher les indicateurs génériques
          try { detachIndicators?.(); } catch {}
          detachIndicators = null;
          try { detachIndicators = await attachIndicators({ router, xtouch: x, config: cfg }); } catch {}
          // Force drivers to re-emit indicator signals after (re)attach so LEDs sync immediately
          try { await refreshIndicators({ router, xtouch: x, config: cfg }); } catch {}
      }
    } catch (e) {
      logger.debug("Hot reload LCD refresh skipped:", e as any);
    }
    // Reconfigurer les listeners background après reload
    try { rebuildBackgroundListeners(router.getActivePage()); } catch {}
    // Reconfigurer l'entrée Gamepad (si activée)
    try {
      detachGamepad?.();
      detachGamepad = null;
      if (cfg?.gamepad?.enabled) {
        detachGamepad = await attachGamepad({ router, config: cfg });
      }
    } catch (e) {
      logger.warn("Gamepad: hot reload attach a échoué:", (e as any)?.message ?? e);
    }
  },
  (err) => logger.warn("Erreur hot reload config:", err as any)
);

  // Sélection page par défaut
  if (cfg.pages.length > 0) {
    router.setActivePage(0);
  }

  // X-Touch: ouvrir les ports définis dans config.yaml
  let xtouch: import("./xtouch/driver").XTouchDriver | null = null;
  let pageBridges: MidiBridgeDriver[] = [];
  
  // Listeners en arrière-plan pour capter le feedback des apps hors page active
  const { bgManager, rebuild } = createBackgroundManager(router);

  

  const rebuildBackgroundListeners = (activePage: PageConfig | undefined) => rebuild(activePage, router.getPagesMerged());
  let detachInputMapper: (() => void) | null = null;
  let detachIndicators: (() => void) | null = null;
  let detachGamepad: (() => void) | null = null;
  try {
    const { xtouch: x, unsubscribeNavigation, paging } = await startXTouchAndNavigation(router, {
      config: cfg,
      onAfterPageChange: (x, page, paging) => {
        try { updateFKeyLedsForActivePage(router, x, paging.channel, cfg.xtouch?.mode ?? "mcu"); } catch {}
        applyLcdForActivePage(router, x);
        rebuildBackgroundListeners(page);
        // MODIF: synchroniser les entrées feedback de controls.midi avec la page (fermer celles couverts par passthroughs)
        try { reconcileControlMidiSenderForPage(page); } catch {}
        if (page?.passthrough || page?.passthroughs) {
          for (const b of pageBridges) {
            try { b.shutdown().catch((err) => logger.warn("Bridge shutdown error:", err as any)); } catch {}
          }
          pageBridges = [];
          const items = getPagePassthroughItems(page);
          buildPageBridges(router, x, items, false).then((bridges) => { pageBridges = bridges; }).catch((err) => logger.warn("Bridge page build error:", err as any));
        } else {
          for (const b of pageBridges) {
            try { b.shutdown().catch((err) => logger.warn("Bridge shutdown error:", err as any)); } catch {}
          }
          pageBridges = [];
        }
        try { router.refreshPage(); } catch {}
        // Refresh LEDs (génériques)
        try { refreshIndicators({ router, xtouch: x, config: cfg }).catch(() => {}); } catch {}
      },
    });
    xtouch = x;
    // Injecter le X-Touch dans le service ControlMidiSender
    setControlMidiSenderXTouch(x);
    // Input layer générique: attacher l'InputMapper (CSV → controlId → router)
    try {
      detachInputMapper = await attachInputMapper({ router, xtouch: x, mode: cfg.xtouch?.mode ?? "mcu", channel: paging.channel });
    } catch (e) {
      logger.warn("InputMapper attach failed:", (e as any)?.message ?? e);
    }
    // Indicateurs génériques (LEDs par CSV)
    try {
      detachIndicators = await attachIndicators({ router, xtouch: x, config: cfg });
    } catch (e) {
      logger.warn("Indicators attach failed:", (e as any)?.message ?? e);
    }
    // Force an initial indicator sync so current scene/studio LEDs light at startup
    try { await refreshIndicators({ router, xtouch: x, config: cfg }); } catch {}

    // Reset déplacé dans startXTouchAndNavigation pour s'exécuter plus tôt

    // Initialiser bridge pour page active si défini
    const initialPage = router.getActivePage();
    try { reconcileControlMidiSenderForPage(initialPage); } catch {}
    if (initialPage?.passthrough || initialPage?.passthroughs) {
      const items = getPagePassthroughItems(initialPage);
      pageBridges = await buildPageBridges(router, x, items, true);
    }
    // Initialiser les listeners background au démarrage
    rebuildBackgroundListeners(initialPage);
    // Gamepad (optionnel)
    try {
      if (cfg?.gamepad?.enabled) {
        detachGamepad = await attachGamepad({ router, config: cfg });
      }
    } catch (e) {
      logger.warn("Gamepad: attach a échoué:", (e as any)?.message ?? e);
    }
    // Forcer un refresh après l'init pour rejouer l'état connu
    try { router.refreshPage(); } catch {}
  } catch (err) {
    logger.warn("X-Touch non connecté:", (err as any)?.message ?? err);
  }

  // CLI & arrêt propre
  let detachCli: () => void = () => {};
  let isCleaningUp = false;
  const cleanup = async (): Promise<void> => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    logger.info("Arrêt XTouch GW");
    
    // Reset complet de la surface X-Touch avant de quitter
    try {
      if (xtouch) {
        logger.info("Reset complet de la surface X-Touch...");
        await xtapi.resetAll(xtouch, { clearLcds: true });
        logger.info("Surface X-Touch réinitialisée.");
      }
    } catch (e) {
      logger.warn("Erreur lors du reset X-Touch:", (e as any)?.message ?? e);
    }
    
    try { persistence.stopSnapshot(); } catch {}
    try { persistence.unsubState(); } catch {}
    try { stopWatch(); } catch {}
    try { for (const b of pageBridges) b.shutdown().catch(() => {}); } catch {}
    try { await shutdownControlMidiSender(); } catch {}
    
    try { xtouch?.stop(); } catch {}
    try { bgManager.shutdown(); } catch {}
    try { detachIndicators?.(); } catch {}
    try { detachInputMapper?.(); } catch {}
    try { detachGamepad?.(); } catch {}
    process.exit(0);
  };

  // CLI de développement (permet 'exit'/'quit' pour arrêter proprement)
  // N'attacher le CLI que si on est dans un terminal interactif (pas sous PM2)
  if (shouldAttachCli()) {
    logger.info("CLI activé (session interactive détectée).");
    detachCli = attachCli({ router, xtouch, onExit: cleanup });
  } else {
    logger.info("CLI désactivé (exécution sous PM2 ou DISABLE_CLI=true ou stdin non-interactif).");
  }

  const onSig = () => {
    try { detachCli(); } catch {}
    cleanup().catch(() => {});
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);
  process.on("uncaughtException", (err: unknown) => {
    logger.error("Uncaught exception:", err as any);
    cleanup().catch(() => {});
  });
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("Unhandled rejection:", reason as any);
    cleanup().catch(() => {});
  });

  return cleanup;
}
