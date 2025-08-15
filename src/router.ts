import { logger } from "./logger";
import type { ControlMapping, Driver, ExecutionContext } from "./types";
import type { AppConfig, PageConfig } from "./config";
import { StateStore, MidiStateEntry, AppKey, MidiStatus, addrKey, MidiValue } from "./state";
import type { XTouchDriver } from "./xtouch/driver";
import { human, hex } from "./midi/utils";
import { getPagePassthroughItems } from "./config/passthrough";
import { resolveAppKey } from "./shared/appKey";
import { LatencyMeter, attachLatencyExtensions } from "./router/latency";

export class Router {
  private config: AppConfig;
  private readonly drivers: Map<string, Driver> = new Map();
  private activePageIndex = 0;
  private readonly state: StateStore;
  private xtouch?: XTouchDriver;
  private refreshTempoMs = 1;
  private readonly xtouchShadow = new Map<string, { value: MidiValue; ts: number }>();
  private readonly appShadows: Record<AppKey, Map<string, { value: MidiValue; ts: number }>> = {
    voicemeeter: new Map(),
    qlc: new Map(),
    obs: new Map(),
    "midi-bridge": new Map(),
  };
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
  private readonly latencyMeters: Record<AppKey, Record<MidiStatus, LatencyMeter>> = {
    voicemeeter: { note: new LatencyMeter(), cc: new LatencyMeter(), pb: new LatencyMeter(), sysex: new LatencyMeter() },
    qlc: { note: new LatencyMeter(), cc: new LatencyMeter(), pb: new LatencyMeter(), sysex: new LatencyMeter() },
    obs: { note: new LatencyMeter(), cc: new LatencyMeter(), pb: new LatencyMeter(), sysex: new LatencyMeter() },
    "midi-bridge": { note: new LatencyMeter(), cc: new LatencyMeter(), pb: new LatencyMeter(), sysex: new LatencyMeter() },
  };

  constructor(initialConfig: AppConfig) {
    this.config = initialConfig;
    this.state = new StateStore();
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

  /**
   * Traite le feedback MIDI reçu d'un logiciel
   * SEULE SOURCE DE VÉRITÉ pour mettre à jour les states
   */
  onMidiFromApp(appKey: string, raw: number[], portId: string): void {
    // Valider que l'app est reconnue
    if (!["voicemeeter", "qlc", "obs", "midi-bridge"].includes(appKey)) {
      logger.warn(`Application '${appKey}' non reconnue, feedback ignoré`);
      return;
    }

    const entry = StateStore.buildEntryFromRaw(raw, portId);
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
      if (!this.xtouch) return;
      const page = this.getActivePage();
      if (!page) return;
      const appsInPage = this.getAppsForPage(page);
      if (!appsInPage.includes(app)) return;
      // Anti-echo: si on vient d'envoyer la même valeur vers l'app (shadow), ignorer
      const k = this.addrKeyForApp(entry.addr);
      const prev = this.appShadows[app].get(k);
      const now = Date.now();
      if (prev) {
        const rtt = now - prev.ts;
        // Enregistrer la latence round-trip même si on va ignorer l'echo (utile pour diagnostiquer)
        try {
          this.latencyMeters[app][entry.addr.status].record(rtt);
        } catch {}
        const win = (this.antiLoopWindowMsByStatus as any)[entry.addr.status] ?? 60;
        if (this.midiValueEquals(prev.value, entry.value) && rtt < win) {
          return;
        }
      }
      // MUTUALISATION: la même pipeline transform/emit que le refresh
      const maybeForward = this.transformAppToXTouch(page, app, entry);
      if (!maybeForward) return;
      // Last-Write-Wins: si une action locale récente a eu lieu sur cette cible X‑Touch, ignorer un feedback plus ancien
      const targetKey = this.addrKeyForXTouch(maybeForward.addr);
      const lastLocal = this.lastUserActionTs.get(targetKey) ?? 0;
      const grace = (maybeForward.addr.status === "pb" ? 300 : 80);
      if (Date.now() - lastLocal < grace) {
        return;
      }
      this.emitToXTouchIfNotDuplicate(maybeForward);
    } catch {}
  }

  markAppShadowForOutgoing(appKey: string, raw: number[], portId: string): void {
    try {
      if (!(["voicemeeter", "qlc", "obs", "midi-bridge"] as string[]).includes(appKey)) return;
      const app = appKey as AppKey;
      const e = StateStore.buildEntryFromRaw(raw, portId);
      if (!e) return;
      const k = this.addrKeyForApp(e.addr);
      this.appShadows[app].set(k, { value: e.value, ts: Date.now() });
    } catch {}
  }

  /** Marque une action locale (X‑Touch) pour LWW/grace windows. */
  markUserActionFromRaw(raw: number[]): void {
    if (!raw || raw.length === 0) return;
    const status = raw[0] ?? 0;
    if (status >= 0xF0) return;
    const type = (status & 0xf0) >> 4;
    const ch = ((status & 0x0f) + 1) | 0;
    let key: string | null = null;
    if (type === 0xE) {
      key = this.addrKeyForXTouch({ status: "pb", channel: ch, data1: 0 } as any);
    } else if (type === 0xB) {
      const cc = raw[1] ?? 0;
      key = this.addrKeyForXTouch({ status: "cc", channel: ch, data1: cc } as any);
    } else if (type === 0x9 || type === 0x8) {
      const note = raw[1] ?? 0;
      key = this.addrKeyForXTouch({ status: "note", channel: ch, data1: note } as any);
    }
    if (key) this.lastUserActionTs.set(key, Date.now());
  }

  /**
   * Refresh complet de la page active selon la nouvelle architecture
   * Utilise UNIQUEMENT les états des logiciels stockés via feedback MIDI
   */
  refreshPage(): void {
    if (!this.xtouch) return;
    const page = this.getActivePage();
    if (!page) return;

    logger.debug(`Refresh page '${page.name}'`);
    // Nouveau cycle: réinitialiser l'ombre X‑Touch pour autoriser la ré‑émission des valeurs cibles
    this.xtouchShadow.clear();

    // 1. Identifier les logiciels utilisés par cette page
    const appsInPage = this.getAppsForPage(page);
    logger.debug(`Apps pour cette page: [${appsInPage.join(", ")}]`);

    // 2. Construire des "plans" par adresse X‑Touch pour éviter les collisions inter‑apps
    type PlanEntry = { entry: MidiStateEntry; priority: number };
    const notePlan = new Map<string, PlanEntry>(); // key: note|ch|d1
    const ccPlan = new Map<string, PlanEntry>();   // key: cc|ch|d1
    const pbPlan = new Map<number, PlanEntry>();   // key: fader channel (1..9)

    const pushNoteCandidate = (e: MidiStateEntry, prio: number) => {
      const k = `note|${e.addr.channel ?? 0}|${e.addr.data1 ?? 0}`;
      const cur = notePlan.get(k);
      if (!cur || prio > cur.priority || (prio === cur.priority && (e.ts ?? 0) > (cur.entry.ts ?? 0))) {
        notePlan.set(k, { entry: e, priority: prio });
      }
    };
    const pushCcCandidate = (e: MidiStateEntry, prio: number) => {
      const k = `cc|${e.addr.channel ?? 0}|${e.addr.data1 ?? 0}`;
      const cur = ccPlan.get(k);
      if (!cur || prio > cur.priority || (prio === cur.priority && (e.ts ?? 0) > (cur.entry.ts ?? 0))) {
        ccPlan.set(k, { entry: e, priority: prio });
      }
    };
    const pushPbCandidate = (ch: number, e: MidiStateEntry, prio: number) => {
      const cur = pbPlan.get(ch);
      if (!cur || prio > cur.priority || (prio === cur.priority && (e.ts ?? 0) > (cur.entry.ts ?? 0))) {
        pbPlan.set(ch, { entry: e, priority: prio });
      }
    };

    // 3. Alimenter les plans depuis chaque app avec priorités
    for (const app of appsInPage) {
      const channels = this.getChannelsForApp(page, app);
      const mapping = this.resolvePbToCcMappingForApp(page, app);

      // PB plan (priorité: PB connu = 3 > CC mappé = 2 > ZERO = 1)
      for (const ch of channels) {
        const latestPb = this.state.getKnownLatestForApp(app, "pb", ch, 0);
        if (latestPb) {
          const transformed = this.transformAppToXTouch(page, app, latestPb);
          if (transformed) pushPbCandidate(ch, transformed, 3);
          continue;
        }
        const ccNum = mapping?.map.get(ch);
        if (ccNum != null) {
          const latestCcSameCh = this.state.getKnownLatestForApp(app, "cc", ch, ccNum);
          const latestCcAnyCh = latestCcSameCh || this.state.getKnownLatestForApp(app, "cc", undefined, ccNum);
          if (latestCcAnyCh) {
            const transformed = this.transformAppToXTouch(page, app, latestCcAnyCh);
            if (transformed) { pushPbCandidate(ch, transformed, 2); }
          }
          // IMPORTANT: si mapping existe mais pas de valeur, NE PAS proposer PB=0 ici
          continue;
        }
        // Aucun état connu et pas de mapping → proposer PB=0 (faible priorité)
        const zero: MidiStateEntry = { addr: { portId: app, status: "pb", channel: ch, data1: 0 }, value: 0, ts: Date.now(), origin: "xtouch", known: false };
        pushPbCandidate(ch, zero, 1);
      }

      // Notes: 0..31 sur canaux pertinents (priorité: connu = 2 > reset OFF = 1)
      for (const ch of channels) {
        for (let note = 0; note <= 31; note++) {
          const latestExact = this.state.getKnownLatestForApp(app, "note", ch, note);
          const latestAnyCh = latestExact || this.state.getKnownLatestForApp(app, "note", undefined, note);
          if (latestAnyCh) {
            const e = this.transformAppToXTouch(page, app, latestAnyCh);
            if (e) pushNoteCandidate(e, 2);
          } else {
            const addr = { portId: app, status: "note" as MidiStatus, channel: ch, data1: note };
            pushNoteCandidate({ addr, value: 0, ts: Date.now(), origin: "xtouch", known: false }, 1);
          }
        }
      }

      // CC (rings): 0..31 sur canaux pertinents (priorité: connu = 2 > reset 0 = 1)
      for (const ch of channels) {
        for (let cc = 0; cc <= 31; cc++) {
          const latestExact = this.state.getKnownLatestForApp(app, "cc", ch, cc);
          const latestAnyCh = latestExact || this.state.getKnownLatestForApp(app, "cc", undefined, cc);
          if (latestAnyCh) {
            const e = this.transformAppToXTouch(page, app, latestAnyCh);
            if (e) pushCcCandidate(e, 2);
          } else {
            const addr = { portId: app, status: "cc" as MidiStatus, channel: ch, data1: cc };
            pushCcCandidate({ addr, value: 0, ts: Date.now(), origin: "xtouch", known: false }, 1);
          }
        }
      }
    }

    // 4. Matérialiser les plans en une liste unique d'entrées à envoyer
    const entriesToSend: MidiStateEntry[] = [];
    for (const { entry } of notePlan.values()) entriesToSend.push(entry);
    for (const { entry } of ccPlan.values()) entriesToSend.push(entry);
    for (const { entry } of pbPlan.values()) entriesToSend.push(entry);

    // 5. Ordonnancement et envoi (Notes -> CC -> SysEx -> PB)
    this.sendEntriesToXTouch(entriesToSend);
    // Anti-boucle app: marquer dans l'AppShadow ce que nous venons d'émettre vers les apps cibles (pour ignorer l'echo)
    const now = Date.now();
    for (const e of entriesToSend) {
      try {
        const app = appsInPage[0] as AppKey; // app de la boucle courante n'est pas accessible ici; marquage conservateur omis pour sécurité
        // Note: AppShadow est déjà géré côté bridge lors des envois; ici on évite tout marquage incorrect
      } catch {}
    }
  }

  /**
   * Identifie les logiciels utilisés par une page à partir de sa config
   */
  private getAppsForPage(page: PageConfig): AppKey[] {
    const items = getPagePassthroughItems(page);
    const appKeys: AppKey[] = Array.isArray(items)
      ? Array.from(new Set(items.map((it: any) => resolveAppKey(it?.to_port, it?.from_port) as AppKey)))
      : [];
    return appKeys.length > 0 ? appKeys : ["voicemeeter"]; // fallback par défaut
  }

  private getChannelsForApp(page: PageConfig, app: AppKey): number[] {
    const items = getPagePassthroughItems(page);
    const relevant = (Array.isArray(items) ? items : [])
      .filter((it: any) => (resolveAppKey(it?.to_port, it?.from_port) as AppKey) === app);
    const channels = new Set<number>();
    for (const it of relevant) {
      const chs: number[] | undefined = it?.filter?.channels;
      if (Array.isArray(chs)) for (const c of chs) if (typeof c === "number") channels.add(c);
      const ccMap = it?.transform?.pb_to_cc?.cc_by_channel;
      if (ccMap && typeof ccMap === "object") {
        for (const k of Object.keys(ccMap)) {
          const n = Number(k);
          if (Number.isFinite(n)) channels.add(n);
        }
      }
      // Si un base_cc est défini, considérer 1..9 (le dédoublonnage via Set évite les doublons)
      if (it?.transform?.pb_to_cc?.base_cc != null) {
        for (let i = 1; i <= 9; i++) channels.add(i);
      }
    }
    if (channels.size === 0) {
      // Fallback si rien de déclaré: couvrir 1..9
      for (let i = 1; i <= 9; i++) channels.add(i);
    }
    return Array.from(channels.values()).sort((a, b) => a - b);
  }

  /**
   * Applique les transformations nécessaires pour une page/app donnée
   */
  private transformAppToXTouch(page: PageConfig, app: AppKey, entry: MidiStateEntry): MidiStateEntry | null {
    const status = entry.addr.status;
    if (status === "note" || status === "pb" || status === "sysex") {
      return entry;
    }
    if (status === "cc") {
      const m = this.resolvePbToCcMappingForApp(page, app);
      const map = m?.map;
      if (!map) return null;
      const ccNum = entry.addr.data1 ?? -1;
      // Inverse lookup: cc -> fader channel
      let faderChannel: number | null = null;
      for (const [ch, cc] of map.entries()) {
        if (cc === ccNum) { faderChannel = ch; break; }
      }
      if (faderChannel == null) return null;
      const v7 = typeof entry.value === "number" ? entry.value : 0;
      // Center CC 64 -> PB 8192, otherwise scale 0..127 -> 0..16383
      const v7c = Math.max(0, Math.min(127, Math.floor(v7)));
      const v14 = (v7c << 7) | (v7c & 0x01);
      return {
        addr: { portId: app, status: "pb", channel: faderChannel, data1: 0 },
        value: v14,
        ts: entry.ts,
        origin: "app",
        known: true,
        stale: entry.stale,
      };
    }
    return null;
  }

  private resolvePbToCcMappingForApp(page: PageConfig, app: AppKey): { map: Map<number, number>; channelForCc: Map<number, number> } | null {
    const items = getPagePassthroughItems(page);
    const cfg = (Array.isArray(items) ? items : [])
      .map((it: any) => ({ app: resolveAppKey(it?.to_port, it?.from_port) as AppKey, transform: it?.transform }))
      .find((x: any) => x.app === app);
    const pb2cc = cfg?.transform?.pb_to_cc;
    if (!pb2cc) return null;
    const out = new Map<number, number>();
    const reverse = new Map<number, number>();
    const baseRaw = pb2cc.base_cc;
    const base = typeof baseRaw === "string" ? parseInt(baseRaw, 16) : (typeof baseRaw === "number" ? baseRaw : undefined);
    for (let ch = 1; ch <= 9; ch++) {
      let cc = pb2cc.cc_by_channel?.[ch];
      if (cc == null && base != null) {
        // Heuristic: many configs used base_cc + (ch-1)
        cc = base + (ch - 1);
      }
      if (typeof cc === "string") {
        cc = cc.startsWith("0x") ? parseInt(cc, 16) : parseInt(cc, 10);
      }
      if (typeof cc === "number") { out.set(ch, cc); reverse.set(cc, ch); }
    }
    return out.size > 0 ? { map: out, channelForCc: reverse } : null;
  }

  /**
   * Envoie les entrées vers X-Touch avec ordonnancement correct
   */
  private sendEntriesToXTouch(entries: MidiStateEntry[]): void {
    if (!this.xtouch) return;

    // Ordonnancement: Notes -> CC -> SysEx -> PitchBend
    const notes = entries.filter((e) => e.addr.status === "note");
    const ccs = entries.filter((e) => e.addr.status === "cc");
    const syx = entries.filter((e) => e.addr.status === "sysex");
    const pbs = entries.filter((e) => e.addr.status === "pb");

    const batches = [notes, ccs, syx, pbs];
    
    // Anti-boucle moteurs: ignorer les PB entrants depuis X-Touch pendant le temps d'établissement
    try { this.xtouch?.squelchPitchBend(120); } catch {}
    
    for (const batch of batches) {
      for (const e of batch) {
        const bytes = this.entryToRawForXTouch(e);
        if (!bytes) continue;
        // Marquer comme action locale simulée pour protéger contre un feedback app légèrement retardé
        try { this.lastUserActionTs.set(this.addrKeyForXTouch(e.addr), Date.now()); } catch {}
        
        this.emitToXTouchIfNotDuplicate(e, bytes);
        
        try {
          if (e.addr.status === "pb") {
            logger.trace(`Send PB -> X-Touch: ${human(bytes)} [${hex(bytes)}]`);
          }
        } catch {}
        
        // Cas particulier: pour éviter clignotement LED, ne pas renvoyer NoteOff (release) ici
        if (e.addr.status === "note" && (e.value as number) === 0) {
          const ch = Math.max(1, Math.min(16, e.addr.channel ?? 1));
          const note = Math.max(0, Math.min(127, e.addr.data1 ?? 0));
          const noteOff = [0x80 + (ch - 1), note, 0];
          // Laisser l'écho local gérer l'affichage; éviter re-send ici pour réduire la charge
          // this.xtouch.sendRawMessage(noteOff);
        }
      }
    }
  }

  private emitToXTouchIfNotDuplicate(entry: MidiStateEntry, prebuilt?: number[]): void {
    if (!this.xtouch) return;
    const k = this.addrKeyForXTouch(entry.addr);
    const prev = this.xtouchShadow.get(k);
    const now = Date.now();
    const win = (this.antiLoopWindowMsByStatus as any)[entry.addr.status] ?? 60;
    if (prev && this.midiValueEquals(prev.value, entry.value) && now - prev.ts < win) {
      return;
    }
    const bytes = prebuilt ?? this.entryToRawForXTouch(entry);
    if (!bytes) return;
    this.xtouch.sendRawMessage(bytes);
    this.xtouchShadow.set(k, { value: entry.value, ts: now });
  }

  private addrKeyForXTouch(addr: MidiStateEntry["addr"]): string {
    const s = addr.status;
    const ch = addr.channel ?? 0;
    const d1 = addr.data1 ?? 0;
    return `${s}|${ch}|${d1}`;
  }

  private addrKeyForApp(addr: MidiStateEntry["addr"]): string {
    // Clé d'anti-echo/latence côté app: ignorer le portId pour associer l'aller (to_port) et le retour (from_port)
    const s = addr.status;
    const ch = addr.channel ?? 0;
    const d1 = addr.data1 ?? 0;
    return `${s}|${ch}|${d1}`;
  }

  private midiValueEquals(a: MidiValue, b: MidiValue): boolean {
    if (a instanceof Uint8Array && b instanceof Uint8Array) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
      return true;
    }
    return (a as any) === (b as any);
  }

  private entryToRawForXTouch(entry: MidiStateEntry): number[] | null {
    const { addr, value } = entry;
    switch (addr.status) {
      case "note": {
        const ch = Math.max(1, Math.min(16, addr.channel ?? 1));
        const status = 0x90 + (ch - 1);
        const note = Math.max(0, Math.min(127, addr.data1 ?? 0));
        const vel = typeof value === "number" ? Math.max(0, Math.min(127, Math.floor(value))) : 0;
        return [status, note, vel];
      }
      case "cc": {
        const ch = Math.max(1, Math.min(16, addr.channel ?? 1));
        const status = 0xB0 + (ch - 1);
        const cc = Math.max(0, Math.min(127, addr.data1 ?? 0));
        const v = typeof value === "number" ? Math.max(0, Math.min(127, Math.floor(value))) : 0;
        return [status, cc, v];
      }
      case "pb": {
        const ch = Math.max(1, Math.min(16, addr.channel ?? 1));
        const status = 0xE0 + (ch - 1);
        // Deadband léger: conserver la valeur exacte pour refléter précisément le setpoint confirmé
        const v14 = typeof value === "number" ? Math.max(0, Math.min(16383, Math.floor(value))) : 8192;
        const lsb = v14 & 0x7F;
        const msb = (v14 >> 7) & 0x7F;
        return [status, lsb, msb];
      }
      case "sysex": {
        if (value instanceof Uint8Array) return Array.from(value);
        return null;
      }
      default:
        return null;
    }
  }
}

// Étend la classe Router avec des utilitaires de latence (séparés pour DRY/tailles)
attachLatencyExtensions(Router as any);
