import type { Router } from "../router";
import { ConsoleDriver } from "../drivers/consoleDriver";
import { QlcDriver } from "../drivers/qlc";
import { ObsDriver } from "../drivers/obs";
import type { AppConfig, PagingConfig, PageConfig } from "../config";
import { XTouchDriver } from "../xtouch/driver";
import { applyLcdForActivePage } from "../ui/lcd";
import { updateFKeyLedsForActivePage, updatePrevNextLeds } from "../xtouch/fkeys";
import { getInputLookups } from "../xtouch/matching";
import { attachFaderValueOverlay } from "../xtouch/valueOverlay";
import { BackgroundListenerManager } from "../midi/backgroundListeners";
import { attachNavigation } from "./navigation";
import * as xtapi from "../xtouch/api";
import { logger } from "../logger";

/**
 * Initialise et enregistre les drivers applicatifs standards.
 */
export async function initDrivers(router: Router): Promise<void> {
  const drivers = [new ConsoleDriver(), new QlcDriver(), new ObsDriver()];
  for (const d of drivers) {
    router.registerDriver(d.name, d);
    await d.init();
  }
}

/**
 * Crée un gestionnaire de listeners d'arrière-plan pour collecter les feedbacks hors page active.
 */
export function createBackgroundManager(router: Router) {
  const bgManager = new BackgroundListenerManager(router);
  const rebuild = (activePage: PageConfig | undefined, pages: PageConfig[]) => {
    bgManager.rebuild(activePage, pages);
  };
  return { bgManager, rebuild } as const;
}

function toRequiredPaging(cfg: AppConfig): Required<PagingConfig> {
  const mode = cfg.xtouch?.mode ?? "mcu";
  let defaultPrev = 46;
  let defaultNext = 47;
  try {
    const { noteToControl } = getInputLookups(mode);
    const noteByControl = new Map<string, number>();
    for (const [note, ctrl] of noteToControl.entries()) noteByControl.set(ctrl, note);
    defaultPrev = noteByControl.get("bank_left") ?? defaultPrev;
    defaultNext = noteByControl.get("bank_right") ?? defaultNext;
  } catch {}
  return {
    channel: cfg.paging?.channel ?? 1,
    prev_note: cfg.paging?.prev_note ?? (defaultPrev as number),
    next_note: cfg.paging?.next_note ?? (defaultNext as number),
  } as any;
}

export interface StartXTouchOptions {
  /** App config courante */
  config: AppConfig;
  /** Callback exécuté après changement de page (LCD, LEDs, bridges, refresh...) */
  onAfterPageChange: (x: XTouchDriver, page: PageConfig | undefined, paging: Required<PagingConfig>) => void;
}

/**
 * Démarre le driver X‑Touch, attache le Router, applique LCD/LEDs et connecte la navigation.
 * Retourne le driver et une fonction pour détacher la navigation.
 */
export async function startXTouchAndNavigation(router: Router, options: StartXTouchOptions): Promise<{ xtouch: XTouchDriver; unsubscribeNavigation: () => void; paging: Required<PagingConfig> }> {
  const { config, onAfterPageChange } = options;

  const xtouch = new XTouchDriver({
    inputName: config.midi.input_port,
    outputName: config.midi.output_port,
  }, { echoPitchBend: false, echoButtonsAndEncoders: false });
  xtouch.start();

  // Reset complet juste après connexion, avant toute application de LCD/LEDs
  try {
    await xtapi.resetAll(xtouch, { clearLcds: true });
    logger.info("X‑Touch réinitialisé au démarrage.");
  } catch (e) {
    logger.warn("Reset X‑Touch au démarrage: ignoré (", (e as any)?.message ?? e, ")");
  }

  router.attachXTouch(xtouch);
  applyLcdForActivePage(router, xtouch);
  const paging = toRequiredPaging(config);
  try { updateFKeyLedsForActivePage(router, xtouch, paging.channel, config.xtouch?.mode ?? "mcu"); } catch {}
  try { updatePrevNextLeds(xtouch, paging.channel, paging.prev_note, paging.next_note); } catch {}

  const unsubscribeNavigation = attachNavigation({
    router,
    xtouch,
    paging,
    mode: config.xtouch?.mode ?? "mcu",
    onAfterPageChange: (page) => onAfterPageChange(xtouch, page, paging),
  });

  // Overlay des valeurs de faders sur LCD (ligne basse)
  try { attachFaderValueOverlay(xtouch, () => router.getActivePage(), config); } catch {}

  return { xtouch, unsubscribeNavigation, paging };
}
