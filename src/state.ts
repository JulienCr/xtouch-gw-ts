import crypto from "crypto";

export type MidiStatus = "note" | "cc" | "pb" | "sysex";

export interface MidiAddr {
  portId: string;
  status: MidiStatus;
  channel?: number;
  data1?: number;
}

export type MidiValue = number | string | Uint8Array;

export interface MidiStateEntry {
  addr: MidiAddr;
  value: MidiValue;
  ts: number;
  origin: "app" | "xtouch";
  known: boolean;
  stale?: boolean;
  hash?: string; // utile pour SysEx
}

export type AppKey = "voicemeeter" | "qlc" | "obs" | "midi-bridge";

export function addrKey(addr: MidiAddr): string {
  const port = addr.portId ?? "";
  const s = addr.status;
  const ch = addr.channel ?? 0;
  const d1 = addr.data1 ?? 0;
  return `${port}|${s}|${ch}|${d1}`;
}

function computeHash(data: Uint8Array): string {
  const h = crypto.createHash("sha1");
  h.update(data);
  return h.digest("hex");
}

export class StateStore {
  private readonly appStates: Map<AppKey, Map<string, MidiStateEntry>> = new Map();
  private readonly subscribers: Set<(entry: MidiStateEntry, app: AppKey) => void> = new Set();

  constructor() {
    this.initializeAppStates();
  }

  private initializeAppStates(): void {
    for (const app of ["voicemeeter", "qlc", "obs", "midi-bridge"] as AppKey[]) {
      this.appStates.set(app, new Map());
    }
  }

  updateFromFeedback(app: AppKey, entry: MidiStateEntry): void {
    const appState = this.appStates.get(app);
    if (!appState) throw new Error(`Application '${app}' non reconnue`);
    const k = addrKey(entry.addr);
    const stored: MidiStateEntry = {
      ...entry,
      origin: "app",
      known: true,
      stale: false,
    };
    appState.set(k, stored);
    // Publier aux abonnés (journal/SSE)
    for (const fn of this.subscribers) {
      try { fn(stored, app); } catch {}
    }
  }

  getStateForApp(app: AppKey, addr: MidiAddr): MidiStateEntry | null {
    const appState = this.appStates.get(app);
    if (!appState) return null;
    const k = addrKey(addr);
    const entry = appState.get(k);
    return entry && entry.known ? entry : null;
  }

  listStatesForApp(app: AppKey): MidiStateEntry[] {
    const appState = this.appStates.get(app);
    if (!appState) return [];
    return Array.from(appState.values());
  }

  listStatesForApps(apps: AppKey[]): Map<AppKey, MidiStateEntry[]> {
    const result = new Map<AppKey, MidiStateEntry[]>();
    for (const app of apps) {
      result.set(app, this.listStatesForApp(app));
    }
    return result;
  }

  subscribe(listener: (entry: MidiStateEntry, app: AppKey) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  /**
   * Retourne la dernière valeur connue (ts le plus récent) pour un triplet (status, channel, data1)
   * indépendamment du portId (utile pour REPLAY sur page active).
   */
  getKnownLatestForApp(
    app: AppKey,
    status: MidiStatus,
    channel?: number,
    data1?: number
  ): MidiStateEntry | null {
    const appState = this.appStates.get(app);
    if (!appState) return null;
    let best: MidiStateEntry | null = null;
    for (const entry of appState.values()) {
      const a = entry.addr;
      if (a.status !== status) continue;
      if (channel !== undefined && (a.channel ?? 0) !== channel) continue;
      if (data1 !== undefined && (a.data1 ?? 0) !== data1) continue;
      if (!entry.known) continue;
      if (!best || entry.ts > best.ts) best = entry;
    }
    return best;
  }

  static buildEntryFromRaw(raw: number[], portId: string): MidiStateEntry | null {
    if (raw.length === 0) return null;
    const status = raw[0];
    const d1 = raw[1] ?? 0;
    const d2 = raw[2] ?? 0;

    if (status === 0xF0) {
      const payload = new Uint8Array(raw);
      return {
        addr: { portId, status: "sysex" },
        value: payload,
        ts: Date.now(),
        origin: "app",
        known: true,
        stale: false,
        hash: computeHash(payload),
      };
    }
    if (status >= 0xF0) return null;

    const typeNibble = (status & 0xF0) >> 4;
    const channel = (status & 0x0F) + 1;

    if (typeNibble === 0x9 || typeNibble === 0x8) {
      const velocity = typeNibble === 0x8 ? 0 : d2;
      return {
        addr: { portId, status: "note", channel, data1: d1 },
        value: velocity,
        ts: Date.now(),
        origin: "app",
        known: true,
        stale: false,
      };
    }
    if (typeNibble === 0xB) {
      return {
        addr: { portId, status: "cc", channel, data1: d1 },
        value: d2,
        ts: Date.now(),
        origin: "app",
        known: true,
        stale: false,
      };
    }
    if (typeNibble === 0xE) {
      const value14 = ((d2 & 0x7F) << 7) | (d1 & 0x7F);
      return {
        addr: { portId, status: "pb", channel, data1: 0 },
        value: value14,
        ts: Date.now(),
        origin: "app",
        known: true,
        stale: false,
      };
    }
    return null;
  }
}

