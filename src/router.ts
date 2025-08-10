import { logger } from "./logger";
import type { ControlMapping, Driver, ExecutionContext } from "./types";
import type { AppConfig, PageConfig } from "./config";
import { StateStore, MidiStateEntry } from "./state";
import type { XTouchDriver } from "./xtouch/driver";

export class Router {
  private config: AppConfig;
  private readonly drivers: Map<string, Driver> = new Map();
  private activePageIndex = 0;
  private readonly state: StateStore;
  private xtouch?: XTouchDriver;
  private refreshTempoMs = 1;

  constructor(initialConfig: AppConfig) {
    this.config = initialConfig;
    this.state = new StateStore(50);
  }

  registerDriver(key: string, driver: Driver): void {
    this.drivers.set(key, driver);
  }

  getActivePage(): PageConfig | undefined {
    return this.config.pages[this.activePageIndex];
  }

  getActivePageName(): string {
    return this.getActivePage()?.name ?? "(none)";
  }

  listPages(): string[] {
    return this.config.pages.map((p) => p.name);
  }

  setActivePage(nameOrIndex: string | number): boolean {
    if (typeof nameOrIndex === "number") {
      if (nameOrIndex >= 0 && nameOrIndex < this.config.pages.length) {
        this.activePageIndex = nameOrIndex;
        logger.info(`Page active: ${this.getActivePageName()}`);
        this.refreshPage();
        return true;
      }
      return false;
    }
    const idx = this.config.pages.findIndex((p) => p.name === nameOrIndex);
    if (idx >= 0) {
      this.activePageIndex = idx;
      logger.info(`Page active: ${this.getActivePageName()}`);
      this.refreshPage();
      return true;
    }
    return false;
  }

  nextPage(): void {
    if (this.config.pages.length === 0) return;
    this.activePageIndex = (this.activePageIndex + 1) % this.config.pages.length;
    logger.info(`Page suivante → ${this.getActivePageName()}`);
    this.refreshPage();
  }

  prevPage(): void {
    if (this.config.pages.length === 0) return;
    this.activePageIndex =
      (this.activePageIndex - 1 + this.config.pages.length) % this.config.pages.length;
    logger.info(`Page précédente → ${this.getActivePageName()}`);
    this.refreshPage();
  }

  async handleControl(controlId: string, value?: unknown): Promise<void> {
    const page = this.getActivePage();
    const mapping = page?.controls?.[controlId] as ControlMapping | undefined;
    if (!mapping) {
      logger.debug(`Aucun mapping pour '${controlId}' sur '${page?.name}'.`);
      return;
    }
    const driver = this.drivers.get(mapping.app);
    if (!driver) {
      logger.warn(`Driver '${mapping.app}' non enregistré. Action '${mapping.action}' ignorée.`);
      return;
    }
    const context: ExecutionContext = { controlId, value: value as any };
    try {
      await driver.execute(mapping.action, mapping.params ?? [], context);
    } catch (err) {
      logger.error(`Erreur lors de l'exécution '${mapping.app}.${mapping.action}':`, err);
    }
  }

  async updateConfig(next: AppConfig): Promise<void> {
    this.config = next;
    if (this.activePageIndex >= this.config.pages.length) {
      this.activePageIndex = 0;
    }
    // refresh config-driven timings if present later
    for (const d of this.drivers.values()) {
      await d.onConfigChanged?.();
    }
    logger.info("Router: configuration mise à jour.");
  }

  attachXTouch(xt: XTouchDriver, options?: { interMsgDelayMs?: number }): void {
    this.xtouch = xt;
    this.refreshTempoMs = Math.max(0, Math.min(5, options?.interMsgDelayMs ?? 1));
  }

  onMidiFromApp(appKey: string, raw: number[]): void {
    const entry = StateStore.buildEntryFromRaw(appKey, raw, "app");
    if (!entry) return;
    this.state.update(appKey, entry);
    // Ne pas renvoyer immédiatement: les drivers se chargent de l'écho instantané.
    // Le Router utilise le store pour les refreshs de page.
  }

  // Refresh complet de la page active: rejoue l'état connu correspondant.
  refreshPage(): void {
    if (!this.xtouch) return;
    const page = this.getActivePage();
    if (!page) return;
    const hasPassthrough = Boolean((page as any).passthrough || (Array.isArray((page as any).passthroughs) && (page as any).passthroughs.length > 0));
    let entries: MidiStateEntry[];
    if (hasPassthrough) {
      // Rejouer l'état des apps concernées (global pour l'instant)
      const appKeys = ["voicemeeter", "qlc", "obs"]; // extensible
      entries = this.state.listEntriesForApps(appKeys);
    } else {
      // Page "par défaut" sans passthrough → forcer un reset visuel minimal
      entries = [];
      // Faders (Pitch Bend) ch 1..9 à 0
      for (let ch = 1; ch <= 9; ch += 1) {
        entries.push({
          addr: { status: "pb", channel: ch, data1: 0 },
          value: 0,
          ts: Date.now(),
          origin: "xtouch",
        });
      }
      // Notes 0..31 sur canal 1 → OFF (NoteOn vel 0). On ne touche qu'au canal 1.
      // ATTENTION: on envoie uniquement vers le port X-Touch; on n'injecte PAS ces msgs dans les bridges.
      for (let n = 0; n <= 31; n += 1) {
        entries.push({
          addr: { status: "note", channel: 1, data1: n },
          value: 0,
          ts: Date.now(),
          origin: "xtouch",
        });
      }
    }

    // Ordonnancement: Notes -> CC -> SysEx -> PitchBend
    const notes = entries.filter((e) => e.addr.status === "note");
    const ccs = entries.filter((e) => e.addr.status === "cc");
    const syx = entries.filter((e) => e.addr.status === "sysex");
    const pbs = entries.filter((e) => e.addr.status === "pb");

    const batches = [notes, ccs, syx, pbs];
    for (const batch of batches) {
      for (const e of batch) {
        const bytes = StateStore.entryToRawForXTouch(e);
        if (!bytes) continue;
        // Éviter d'envoyer si identique sauf sur page par défaut (on force)
        if (hasPassthrough) {
          if (this.state.hasSameLastSent(e.addr, e.value)) continue;
        }
        // Important: n'envoyer que sur le port X-Touch; ne pas relayer ces frames vers les apps
        this.xtouch.sendRawMessage(bytes);
        this.state.markSentToXTouch(e.addr, e.value);
        // Cas particulier: certaines firmwares X-Touch/MCU exigent un NoteOff explicite (0x80)
        // pour éteindre les LED, alors que NoteOn vel=0 devrait suffire.
        // Sur la page par défaut (reset), on envoie donc un NoteOff supplémentaire.
        if (!hasPassthrough && e.addr.status === "note" && (e.value as number) === 0) {
          const ch = Math.max(1, Math.min(16, e.addr.channel ?? 1));
          const note = Math.max(0, Math.min(127, e.addr.data1 ?? 0));
          const noteOff = [0x80 + (ch - 1), note, 0];
          this.xtouch.sendRawMessage(noteOff);
        }
        // tempo
        if (this.refreshTempoMs > 0) {
          // Busy wait micro-delay is bad; use setTimeout-like? Here synchronous, we skip.
        }
      }
    }
  }
}
