import crypto from "crypto";

export type MidiStatus = "note" | "cc" | "pb" | "sysex" | "unknown";

export interface MidiAddr {
  status: MidiStatus;
  channel?: number; // 1..16 si applicable
  data1?: number; // note ou cc selon le type
}

export type MidiValue = number | string | Uint8Array;

export type MidiOrigin = "app" | "xtouch";

export interface MidiStateEntry {
  addr: MidiAddr;
  value: MidiValue;
  ts: number; // ms monotonic-ish (Date.now())
  origin: MidiOrigin;
  // Pour SysEx, on peut garder un hash pour debug/comparaison
  hash?: string;
}

export type AppKey = string; // ex: "voicemeeter" | "qlc" | "obs" | nom libre

function addrKey(addr: MidiAddr): string {
  const s = addr.status;
  const ch = addr.channel ?? 0;
  const d1 = addr.data1 ?? 0;
  return `${s}:${ch}:${d1}`;
}

function computeHash(data: Uint8Array): string {
  const h = crypto.createHash("sha1");
  h.update(data);
  return h.digest("hex");
}

export class StateStore {
  private readonly apps: Map<AppKey, Map<string, MidiStateEntry>> = new Map();
  // Anti-boucle côté X-Touch: dernière valeur envoyée par nous
  private readonly lastSentToXTouch: Map<string, MidiValue> = new Map();

  // Fenêtre anti-boucle en ms
  private readonly loopWindowMs: number;

  constructor(loopWindowMs = 50) {
    this.loopWindowMs = loopWindowMs;
  }

  update(app: AppKey, entry: MidiStateEntry): void {
    const k = addrKey(entry.addr);
    let m = this.apps.get(app);
    if (!m) {
      m = new Map();
      this.apps.set(app, m);
    }
    m.set(k, entry);
  }

  get(app: AppKey, addr: MidiAddr): MidiStateEntry | undefined {
    const m = this.apps.get(app);
    if (!m) return undefined;
    return m.get(addrKey(addr));
  }

  listEntriesForApps(apps: AppKey[]): MidiStateEntry[] {
    const out: MidiStateEntry[] = [];
    for (const a of apps) {
      const m = this.apps.get(a);
      if (!m) continue;
      for (const v of m.values()) out.push(v);
    }
    return out;
  }

  markSentToXTouch(addr: MidiAddr, value: MidiValue): void {
    this.lastSentToXTouch.set(addrKey(addr), value);
  }

  hasSameLastSent(addr: MidiAddr, value: MidiValue): boolean {
    const k = addrKey(addr);
    const last = this.lastSentToXTouch.get(k);
    if (last === undefined) return false;
    if (value instanceof Uint8Array && last instanceof Uint8Array) {
      if (value.length !== last.length) return false;
      for (let i = 0; i < value.length; i += 1) {
        if (value[i] !== last[i]) return false;
      }
      return true;
    }
    return (value as any) === (last as any);
  }

  wasSentToXTouchRecently(
    addr: MidiAddr,
    incomingValue: MidiValue,
    nowTs: number,
    lastAppEntry?: MidiStateEntry
  ): boolean {
    const k = addrKey(addr);
    const lastValue = this.lastSentToXTouch.get(k);
    if (lastValue === undefined) return false;
    // Comparaison basique: nombre égal, chaîne égale, ou hash SysEx égal
    if (incomingValue instanceof Uint8Array && lastValue instanceof Uint8Array) {
      if (incomingValue.length !== lastValue.length) return false;
      for (let i = 0; i < incomingValue.length; i += 1) {
        if (incomingValue[i] !== lastValue[i]) return false;
      }
      return true;
    }
    return (incomingValue as any) === (lastValue as any) &&
      // si on a un entry app pour le même addr, vérifier la fenêtre de temps
      (lastAppEntry ? nowTs - lastAppEntry.ts < this.loopWindowMs : true);
  }

  // Utilitaires de création d'entry à partir de trames brutes
  static buildEntryFromRaw(app: AppKey, raw: number[], origin: MidiOrigin): MidiStateEntry | null {
    if (raw.length === 0) return null;
    const status = raw[0];
    const d1 = raw[1] ?? 0;
    const d2 = raw[2] ?? 0;

    if (status === 0xF0) {
      const payload = new Uint8Array(raw);
      return {
        addr: { status: "sysex" },
        value: payload,
        ts: Date.now(),
        origin,
        hash: computeHash(payload),
      };
    }
    if (status >= 0xF0) return null; // ignorer system common/realtime pour l'état

    const typeNibble = (status & 0xF0) >> 4;
    const channel = (status & 0x0F) + 1; // 1..16

    if (typeNibble === 0x9 || typeNibble === 0x8) {
      // Note On/Off → on stocke note + vélocité (127 on, 0 off)
      const velocity = typeNibble === 0x8 ? 0 : d2;
      return {
        addr: { status: "note", channel, data1: d1 },
        value: velocity,
        ts: Date.now(),
        origin,
      };
    }
    if (typeNibble === 0xB) {
      return {
        addr: { status: "cc", channel, data1: d1 },
        value: d2,
        ts: Date.now(),
        origin,
      };
    }
    if (typeNibble === 0xE) {
      const value14 = ((d2 & 0x7F) << 7) | (d1 & 0x7F);
      return {
        addr: { status: "pb", channel, data1: 0 },
        value: value14,
        ts: Date.now(),
        origin,
      };
    }
    return null;
  }

  static entryToRawForXTouch(entry: MidiStateEntry): number[] | null {
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


