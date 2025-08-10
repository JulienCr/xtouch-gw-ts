import { logger } from "../logger";
import type { XTouchDriver } from "../xtouch/driver";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const VmLib: any = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("voicemeeter-connector");
  } catch {
    return null;
  }
})();

export interface VmSyncOptions {
  dirtyIntervalMs?: number;
}

export class VoicemeeterSync {
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private vm: any | null = null;

  constructor(private readonly xtouch: XTouchDriver, private readonly options: VmSyncOptions = {}) {}

  private async ensureVm(): Promise<any | null> {
    if (this.vm) return this.vm;
    if (!VmLib) {
      logger.warn("voicemeeter-connector non disponible");
      return null;
    }
    try {
      let instance: any = null;
      if (VmLib.Voicemeeter?.init) {
        instance = await VmLib.Voicemeeter.init();
        instance.connect?.();
      } else if (VmLib.connect) {
        instance = await VmLib.connect();
      } else if (VmLib.default?.connect) {
        instance = await VmLib.default.connect();
      }
      if (!instance) throw new Error("Impossible d'initialiser Voicemeeter");
      try { instance.isParametersDirty?.(); } catch {}
      this.vm = instance;
      logger.info("VoicemeeterSync: connecté.");
      return this.vm;
    } catch (err) {
      logger.warn("VoicemeeterSync: échec connexion:", err as any);
      return null;
    }
  }

  private dbTo14bit(db: number): number {
    const min = -60;
    const max = 12;
    const clamped = Math.max(min, Math.min(max, db));
    const norm = (clamped - min) / (max - min);
    return Math.max(0, Math.min(16383, Math.round(norm * 16383)));
  }

  private async readStripGainDb(vm: any, index: number): Promise<number | null> {
    try {
      if (vm.getParameter) {
        const v = await vm.getParameter(`Strip[${index}].Gain`);
        if (typeof v === "number") return v;
      }
      if (vm.get) {
        const v = await vm.get(`strip[${index}].gain`);
        if (typeof v === "number") return v;
      }
      if (vm.getStrip) {
        const s = vm.getStrip(index);
        const v = typeof s?.gain === "number" ? s.gain : typeof s?.Gain === "number" ? s.Gain : undefined;
        if (typeof v === "number") return v;
      }
      if (vm.parameters?.get) {
        const v = await vm.parameters.get(`Strip[${index}].Gain`);
        if (typeof v === "number") return v;
      }
    } catch (err) {
      logger.debug("VM read strip gain err:", err as any);
    }
    return null;
  }

  private async applyFader(index0: number, db: number): Promise<void> {
    const v14 = this.dbTo14bit(db);
    logger.debug(`VM Sync: strip ${index0 + 1} gain=${db.toFixed(2)} dB → ${v14}`);
    this.xtouch.setFader14(index0 + 1, v14);
    // Petit spacing pour éviter d’inonder la surface
    await new Promise((r) => setTimeout(r, 4));
  }

  async startSnapshotForPage(pageName: string): Promise<void> {
    const vm = await this.ensureVm();
    if (!vm) return;
    this.started = true;

    // Force un tick dirty pour rafraîchir les valeurs avant lecture
    try { await vm.isParametersDirty?.(); } catch {}

    for (let i = 0; i < 8; i += 1) {
      const db = await this.readStripGainDb(vm, i);
      if (typeof db === "number") {
        await this.applyFader(i, db);
      } else {
        logger.debug(`VM Sync: strip ${i + 1} gain non disponible`);
      }
    }
    logger.info(`VM Sync: snapshot faders effectué pour page '${pageName}'.`);
  }

  startDirtyLoop(): void {
    if (this.timer) return;
    const interval = this.options.dirtyIntervalMs ?? 150;
    this.timer = setInterval(async () => {
      if (!this.started) return;
      const vm = await this.ensureVm();
      if (!vm) return;
      let dirty = false;
      try {
        dirty = !!(await vm.isParametersDirty?.());
      } catch {
        dirty = true;
      }
      if (!dirty) return;
      for (let i = 0; i < 8; i += 1) {
        const db = await this.readStripGainDb(vm, i);
        if (typeof db === "number") {
          await this.applyFader(i, db);
        }
      }
    }, interval);
    logger.info("VM Sync: dirty loop démarrée.");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
    logger.info("VM Sync: arrêté.");
  }
}
