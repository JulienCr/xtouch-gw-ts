import { logger } from "./logger";
import type { ControlMapping, Driver, ExecutionContext } from "./types";
import type { AppConfig, PageConfig } from "./config";
import { StateStore, MidiStateEntry, AppKey, MidiStatus, MidiValue, buildEntryFromRaw } from "./state";
import type { XTouchDriver } from "./xtouch/driver";
import { human, hex, getTypeNibble, isPB, isCC, isNoteOn } from "./midi/utils";
import { addrKeyWithoutPort } from "./shared/addrKey";
import { getAppsForPage, getChannelsForApp, resolvePbToCcMappingForApp, transformAppToXTouch } from "./router/page";
import { LatencyMeter, attachLatencyExtensions } from "./router/latency";
import { makeXTouchEmitter } from "./router/emit";
import { midiValueEquals, getAntiLoopMs } from "./router/antiEcho";
import { planRefresh } from "./router/planner";
import { forwardFromApp } from "./router/forward";

/**
 * Routeur principal orchestrant la navigation de pages, l'ingestion des feedbacks
 * applicatifs et la restitution vers le X‑Touch.
 *
 * Invariants clés:
 * - La source de vérité des états applicatifs est alimentée uniquement par `onMidiFromApp()`
 * - Le refresh de page rejoue les états connus (Notes→CC→SysEx→PB) sans doublons (anti‑echo)
 * - La politique Last‑Write‑Wins protège les actions utilisateur locales récentes
 */
export class Router {
  private config: AppConfig;
  private readonly drivers: Map<string, Driver> = new Map();
  private activePageIndex = 0;
  private readonly state: StateStore;
  private xtouch?: XTouchDriver;
  private emitter?: ReturnType<typeof makeXTouchEmitter>;
  private readonly appShadows: Map<string, Map<string, { value: MidiValue; ts: number }>> = new Map();
  /** Timestamp de la dernière action locale (X‑Touch) par cible X‑Touch (status|ch|d1). */
  private readonly lastUserActionTs: Map<string, number> = new Map();
  /**
   * Fenêtres anti-echo spécifiques par type d'évènement MIDI (ms).
   * Objectif: éviter les boucles sans retarder les feedbacks utiles.
   */
  private readonly antiLoopWindowMsByStatus: Record<MidiStatus, number> = {
    note: 30,
    cc: 50,
    pb: 250,
    sysex: 60,
  } as const;

  /**
   * Mètres de latence round-trip par app/type, utilisés pour les rapports CLI.
   */
  private readonly latencyMeters: Record<string, Record<MidiStatus, LatencyMeter>> = {};

  /**
   * Crée un `Router` avec une configuration d'app (pages, mapping, paging, etc.).
   *
   * @param initialConfig - Configuration applicative initiale
   */
  constructor(initialConfig: AppConfig) {
    this.config = initialConfig;
    this.state = new StateStore();
  }

  /**
   * Enregistre un driver applicatif par clé (ex: "voicemeeter", "qlc", "obs").
   */
  /**
   * Enregistre un driver applicatif, disponible pour `handleControl()`.
   * @param key - Clé d'application (ex: "voicemeeter", "qlc", "obs")
   * @param driver - Implémentation de driver
   */
  registerDriver(key: string, driver: Driver): void {
    this.drivers.set(key, driver);
  }

  /** Retourne la page active. */
  /**
   * Retourne la configuration de la page active.
   */
  getActivePage(): PageConfig | undefined {
    return this.config.pages[this.activePageIndex];
  }

  /** Retourne le nom de la page active. */
  /**
   * Retourne le nom de la page active, ou "(none)" si aucune page.
   */
  getActivePageName(): string {
    return this.getActivePage()?.name ?? "(none)";
  }

  /** Liste les noms des pages configurées. */
  /**
   * Liste les noms des pages disponibles.
   */
  listPages(): string[] {
    return this.config.pages.map((p) => p.name);
  }

  /**
   * Définit la page active par index ou par nom et déclenche un refresh.
   * Retourne true si la page a été changée.
   */
  /**
   * Définit la page active par index ou par nom et déclenche un refresh.
   * @returns true si le changement a été effectué
   */
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

  /** Passe à la page suivante (circulaire) et rafraîchit. */
  /**
   * Passe à la page suivante (circulaire) et rafraîchit.
   */
  nextPage(): void {
    if (this.config.pages.length === 0) return;
    this.activePageIndex = (this.activePageIndex + 1) % this.config.pages.length;
    logger.info(`Page suivante → ${this.getActivePageName()}`);
    this.refreshPage();
  }

  /** Passe à la page précédente (circulaire) et rafraîchit. */
  /**
   * Passe à la page précédente (circulaire) et rafraîchit.
   */
  prevPage(): void {
    if (this.config.pages.length === 0) return;
    this.activePageIndex =
      (this.activePageIndex - 1 + this.config.pages.length) % this.config.pages.length;
    logger.info(`Page précédente → ${this.getActivePageName()}`);
    this.refreshPage();
  }

  /**
   * Exécute l'action mappée pour un contrôle logique de la page courante.
   */
  /**
   * Exécute l'action mappée pour un contrôle logique de la page courante.
   * @param controlId - Identifiant de contrôle logique (clé du mapping)
   * @param value - Valeur facultative associée
   */
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

  /** Met à jour la configuration et notifie les drivers. */
  /**
   * Met à jour la configuration et notifie les drivers.
   */
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

  /** Attache le driver X‑Touch au router. */
  /**
   * Attache le driver X‑Touch au router et prépare l'émetteur.
   */
  attachXTouch(xt: XTouchDriver): void {
    this.xtouch = xt;
    this.emitter = makeXTouchEmitter(xt, {
      antiLoopWindows: this.antiLoopWindowMsByStatus,
      getAddrKeyWithoutPort: (addr) => this.addrKeyForXTouch(addr),
      markLocalActionTs: (key, ts) => this.lastUserActionTs.set(key, ts),
      logPitchBend: true,
    });
  }

  /**
   * Traite le feedback MIDI reçu d'un logiciel
   * SEULE SOURCE DE VÉRITÉ pour mettre à jour les states
   */
  /**
   * Traite un feedback MIDI brut provenant d'une application (Voicemeeter/QLC/OBS...).
   * Met à jour le StateStore et, si pertinent pour la page active, rejoue vers X‑Touch avec protections anti‑echo.
   */
  /**
   * Ingestion d'un feedback MIDI brut provenant d'une application (Voicemeeter/QLC/OBS...).
   * Met à jour le StateStore et, si pertinent pour la page active, rejoue vers X‑Touch.
   */
  onMidiFromApp(appKey: string, raw: number[], portId: string): void {
    const entry = buildEntryFromRaw(raw, portId);
    if (!entry) return;

    const app = appKey as AppKey;

    // Mettre à jour l'état du logiciel
    this.state.updateFromFeedback(app, entry);

    // Trace pour debug
    try {
      const kind = entry.addr.status;
      const ch = entry.addr.channel ?? 0;
      const d1 = entry.addr.data1 ?? 0;
      const val = Array.isArray(entry.value) ? `${(entry.value as Uint8Array).length}b` : String(entry.value);
      logger.debug(`State <- ${app}: ${human(raw)} [${hex(raw)}] → ${kind} ch=${ch} d1=${d1} val=${val}`);
    } catch {}

    // Si la page active implique cette app, envisager un forward immédiat vers X‑Touch (replay live)
    try {
      const deps = {
        getActivePage: () => this.getActivePage(),
        hasXTouch: () => !!this.xtouch,
        getAppShadow: (a: string) => this.getAppShadow(a),
        addrKeyForApp: (addr: MidiStateEntry["addr"]) => this.addrKeyForApp(addr),
        addrKeyForXTouch: (addr: MidiStateEntry["addr"]) => this.addrKeyForXTouch(addr),
        ensureLatencyMeters: (a: string) => this.ensureLatencyMeters(a),
        antiLoopWindows: this.antiLoopWindowMsByStatus,
        lastUserActionTs: this.lastUserActionTs,
        emitIfNotDuplicate: (e: MidiStateEntry) => this.emitter?.emitIfNotDuplicate(e),
      } as const;
      forwardFromApp(deps, app, entry);
    } catch {}
  }

  /**
   * Marque le dernier message émis vers une app (shadow) pour l'anti‑echo et la mesure de latence RTT.
   */
  /**
   * Marque le dernier message émis vers une app (shadow) pour l'anti‑echo et la latence RTT.
   */
  markAppShadowForOutgoing(appKey: string, raw: number[], portId: string): void {
    try {
      const app = appKey as AppKey;
      const e = buildEntryFromRaw(raw, portId);
      if (!e) return;
      const k = this.addrKeyForApp(e.addr);
      this.getAppShadow(app).set(k, { value: e.value, ts: Date.now() });
    } catch {}
  }

  /**
   * Marque une action locale (X‑Touch) à partir d'une trame brute, pour appliquer les fenêtres de grâce LWW.
   */
  /**
   * Marque une action locale (X‑Touch) à partir d'une trame brute, pour appliquer LWW.
   */
  markUserActionFromRaw(raw: number[]): void {
    if (!raw || raw.length === 0) return;
    const status = raw[0] ?? 0;
    if (status >= 0xF0) return;
    const ch = ((status & 0x0f) + 1) | 0;
    let key: string | null = null;
    if (isPB(status)) {
      key = this.addrKeyForXTouch({ status: "pb", channel: ch, data1: 0 } as any);
    } else if (isCC(status)) {
      const cc = raw[1] ?? 0;
      key = this.addrKeyForXTouch({ status: "cc", channel: ch, data1: cc } as any);
    } else if (isNoteOn(status) || getTypeNibble(status) === 0x8) {
      const note = raw[1] ?? 0;
      key = this.addrKeyForXTouch({ status: "note", channel: ch, data1: note } as any);
    }
    if (key) this.lastUserActionTs.set(key, Date.now());
  }

  /**
   * Refresh complet de la page active selon la nouvelle architecture
   * Utilise UNIQUEMENT les états des logiciels stockés via feedback MIDI
   */
  /** Rafraîchit complètement la page active (replay des états connus vers X‑Touch). */
  /**
   * Rafraîchit complètement la page active (replay des états connus vers X‑Touch).
   */
  refreshPage(): void {
    if (!this.xtouch) return;
    const page = this.getActivePage();
    if (!page) return;

    logger.debug(`Refresh page '${page.name}'`);
    // Nouveau cycle: réinitialiser l'ombre X‑Touch pour autoriser la ré‑émission des valeurs cibles
    try { this.emitter?.clearShadow(); } catch {}

    // 1. Identifier les logiciels utilisés par cette page
    const appsInPage = getAppsForPage(page);
    logger.debug(`Apps pour cette page: [${appsInPage.join(", ")}]`);

    // 2-5. Construire le plan et l'émettre (Notes -> CC -> SysEx -> PB)
    const entriesToSend = planRefresh(page, this.state);
    this.emitter?.send(entriesToSend);
    // Anti-boucle app: marquer dans l'AppShadow ce que nous venons d'émettre vers les apps cibles (pour ignorer l'echo)
    const now = Date.now();
    for (const e of entriesToSend) {
      try {
        const app = appsInPage[0] as AppKey; // app de la boucle courante n'est pas accessible ici; marquage conservateur omis pour sécurité
        // Note: AppShadow est déjà géré côté bridge lors des envois; ici on évite tout marquage incorrect
      } catch {}
    }
  }


  private addrKeyForXTouch(addr: MidiStateEntry["addr"]): string {
    return addrKeyWithoutPort(addr as any);
  }

  private addrKeyForApp(addr: MidiStateEntry["addr"]): string {
    // Anti-echo/latence côté app: ignorer le portId pour associer l'aller (to_port) et le retour (from_port)
    return addrKeyWithoutPort(addr as any);
  }

  private getAppShadow(appKey: string): Map<string, { value: MidiValue; ts: number }> {
    let m = this.appShadows.get(appKey);
    if (!m) {
      m = new Map();
      this.appShadows.set(appKey, m);
    }
    return m;
  }

  private ensureLatencyMeters(appKey: string): Record<MidiStatus, LatencyMeter> {
    let m = this.latencyMeters[appKey];
    if (!m) {
      m = { note: new LatencyMeter(), cc: new LatencyMeter(), pb: new LatencyMeter(), sysex: new LatencyMeter() };
      this.latencyMeters[appKey] = m;
    }
    return m;
  }

  // entryToRawForXTouch/emit/send extraits vers router/emit.ts
}

// Étend la classe Router avec des utilitaires de latence (séparés pour DRY/tailles)
attachLatencyExtensions(Router as any);
