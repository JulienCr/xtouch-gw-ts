import { logger } from "./logger";
import type { ControlMapping, Driver, ExecutionContext } from "./types";
import type { AppConfig, PageConfig } from "./config";
import { StateStore, MidiStateEntry } from "./state";
import { applyReverseTransform } from "./midi/transform";
import type { XTouchDriver } from "./xtouch/driver";
import { human, hex } from "./midi/utils";

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
    // Trace utile pour diagnostiquer les refreshs et la reconstruction PB depuis CC/Notes
    try {
      const kind = entry.addr.status;
      const ch = entry.addr.channel ?? 0;
      const d1 = entry.addr.data1 ?? 0;
      const val = Array.isArray(entry.value) ? `${(entry.value as Uint8Array).length}b` : String(entry.value);
      // Niveau debug pour ne pas spammer par défaut
      logger.debug(`State <- ${appKey}: ${human(raw)} [${hex(raw)}] → ${kind} ch=${ch} d1=${d1} val=${val}`);
    } catch {}
    // Ne pas renvoyer immédiatement: les drivers se chargent de l'écho instantané.
    // Le Router utilise le store pour les refreshs de page.
  }

  // Refresh complet de la page active: rejoue l'état connu correspondant.
  refreshPage(): void {
    if (!this.xtouch) return;
    const page = this.getActivePage();
    if (!page) return;
    // Déterminer dynamiquement les apps concernées par la page
    const items = (page as any).passthroughs
      ?? ((page as any).passthrough ? [(page as any).passthrough] : []);
    const resolveAppKey = (toPort: string, fromPort: string): string => {
      const to = (toPort || "").toLowerCase();
      const from = (fromPort || "").toLowerCase();
      const txt = `${to} ${from}`;
      if (txt.includes("qlc")) return "qlc";
      if (txt.includes("xtouch-gw") || txt.includes("voicemeeter")) return "voicemeeter";
      if (txt.includes("obs")) return "obs";
      return "midi-bridge";
    };
    const appKeysFromPage: string[] = Array.isArray(items)
      ? Array.from(new Set(items.map((it: any) => resolveAppKey(it?.to_port, it?.from_port))))
      : [];
    const transformsByApp: Map<string, any[]> = new Map();
    if (Array.isArray(items)) {
      for (const it of items as any[]) {
        const appKey = resolveAppKey(it?.to_port, it?.from_port);
        const arr = transformsByApp.get(appKey) ?? [];
        if (it?.transform) arr.push(it.transform);
        transformsByApp.set(appKey, arr);
      }
    }
    const hasPassthrough = appKeysFromPage.length > 0;
    logger.debug(
      `Refresh page '${page.name}' (passthrough=${hasPassthrough}) apps=[${appKeysFromPage.join(", ")}], transforms: ${
        Array.from(transformsByApp.entries()).map(([k, v]) => `${k}:${v.length}`).join(", ") || "none"
      }`
    );
    let entries: MidiStateEntry[];
    if (hasPassthrough) {
      // Rejouer l'état si présent, sinon valeurs nulles, sur PB ch1..9 et Notes 0..31 ch1..9
      // IMPORTANT: ne considérer que les apps actives pour la page courante
      const globalPriority = ["voicemeeter", "qlc", "obs", "midi-bridge"] as const;
      const pagePriority = globalPriority.filter((k) => appKeysFromPage.includes(k));

      // Construire un index (status,ch,data1) -> entry en piochant prioritairement PB/NOTE,
      // et en complétant à partir des CC via applyReverseTransform selon les transforms de la page
      const byKey = new Map<string, MidiStateEntry>();
      const keyOf = (e: MidiStateEntry) => `${e.addr.status}:${e.addr.channel ?? 0}:${e.addr.data1 ?? 0}`;

      for (const app of pagePriority) {
        const appEntries = this.state.listEntriesForApps([app]);
        const transforms = transformsByApp.get(app) ?? [];
        // Si l'app n'a PAS de transform sur cette page, on peut réutiliser ses PB/Notes existants (ex: voicemeeter)
        // Si l'app a des transforms (ex: QLC pb->cc), on ignore ses PB/Notes stockés (souvent dérivés d'une autre page)
        if (transforms.length === 0) {
          for (const e of appEntries) {
            if (e.addr.status === "pb" || e.addr.status === "note") {
              const k = keyOf(e);
              if (!byKey.has(k)) byKey.set(k, e);
            }
          }
        }
      }

      // Essayer d'inférer des PB depuis des CC avec les transforms de la page
      for (const app of pagePriority) {
        const appEntries = this.state.listEntriesForApps([app]);
        const transforms = transformsByApp.get(app) ?? [];
        if (transforms.length === 0) continue;
        for (const e of appEntries) {
          if (e.addr.status !== "cc" && e.addr.status !== "note") continue;
          const raw = StateStore.entryToRawForXTouch(e);
          if (!raw) continue;
          for (const t of transforms) {
            const rev = applyReverseTransform(raw, t);
            if (!rev) continue;
            const inferred = StateStore.buildEntryFromRaw(app, rev, "app");
            if (inferred && inferred.addr.status === "pb") {
              const k = keyOf(inferred);
              if (!byKey.has(k)) byKey.set(k, inferred);
              try {
                logger.debug(
                  `Infer PB from ${app}: ${human(raw)} [${hex(raw)}] → ${human(rev)} [${hex(rev)}] (ch=${inferred.addr.channel}, val=${inferred.value})`
                );
              } catch {}
            }
          }
        }
      }

      const now = Date.now();
      entries = [];
      // Faders (PB) ch1..9: rejouer connus ou 0
      for (let ch = 1; ch <= 9; ch += 1) {
        const k = `pb:${ch}:0`;
        const found = byKey.get(k);
        entries.push(found ?? { addr: { status: "pb", channel: ch, data1: 0 }, value: 0, ts: now, origin: "xtouch" });
      }
      // Notes 0..31 ch1..9: rejouer connus ou éteindre
      for (let ch = 1; ch <= 9; ch += 1) {
        for (let n = 0; n <= 31; n += 1) {
          const k = `note:${ch}:${n}`;
          const found = byKey.get(k);
          entries.push(found ?? { addr: { status: "note", channel: ch, data1: n }, value: 0, ts: now, origin: "xtouch" });
        }
      }
      // CC 0..31 ch1..9: reset à 0 pour éviter les résidus visuels (rings/encoders) d'une autre page
      for (let ch = 1; ch <= 9; ch += 1) {
        for (let cc = 0; cc <= 31; cc += 1) {
          entries.push({ addr: { status: "cc", channel: ch, data1: cc }, value: 0, ts: now, origin: "xtouch" });
        }
      }
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
      // Notes 0..31 sur canaux 1..9 → OFF (NoteOn vel 0)
      // ATTENTION: on envoie uniquement vers le port X-Touch; on n'injecte PAS ces msgs dans les bridges.
      for (let ch = 1; ch <= 9; ch += 1) {
        for (let n = 0; n <= 31; n += 1) {
          entries.push({
            addr: { status: "note", channel: ch, data1: n },
            value: 0,
            ts: Date.now(),
            origin: "xtouch",
          });
        }
      }
      // CC 0..31 sur canaux 1..9 → 0
      for (let ch = 1; ch <= 9; ch += 1) {
        for (let cc = 0; cc <= 31; cc += 1) {
          entries.push({
            addr: { status: "cc", channel: ch, data1: cc },
            value: 0,
            ts: Date.now(),
            origin: "xtouch",
          });
        }
      }
    }

    // Ordonnancement: Notes -> CC -> SysEx -> PitchBend
    // On force l'ordre: Notes -> CC -> SysEx -> PB
    const notes = entries.filter((e) => e.addr.status === "note");
    const ccs = entries.filter((e) => e.addr.status === "cc");
    const syx = entries.filter((e) => e.addr.status === "sysex");
    const pbs = entries.filter((e) => e.addr.status === "pb");

    const batches = [notes, ccs, syx, pbs];
    for (const batch of batches) {
      for (const e of batch) {
        const bytes = StateStore.entryToRawForXTouch(e);
        if (!bytes) continue;
        // Important: sur changement de page, on force l'envoi des resets même si identiques
        // (ex. certains firmwares nécessitent un NoteOff explicite après NoteOn vel 0)
        // Important: n'envoyer que sur le port X-Touch; ne pas relayer ces frames vers les apps
        this.xtouch.sendRawMessage(bytes);
        this.state.markSentToXTouch(e.addr, e.value);
        try {
          if (e.addr.status === "pb") {
            logger.trace(`Send PB -> X-Touch: ${human(bytes)} [${hex(bytes)}]`);
          }
        } catch {}
        // Cas particulier: certaines firmwares X-Touch/MCU exigent un NoteOff explicite (0x80)
        // pour éteindre les LED, alors que NoteOn vel=0 devrait suffire.
        // On envoie un NoteOff supplémentaire pour toute note mise à 0.
        if (e.addr.status === "note" && (e.value as number) === 0) {
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
