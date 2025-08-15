import crypto from "crypto";

/** Type d'évènement MIDI supporté par le StateStore. */
export type MidiStatus = "note" | "cc" | "pb" | "sysex";

/** Adresse logique d'un évènement MIDI (incluant le port/application source). */
export interface MidiAddr {
  portId: string;
  status: MidiStatus;
  channel?: number;
  data1?: number;
}

/** Valeur d'état MIDI: numérique (Note/CC/PB), texte, ou binaire (SysEx complet). */
export type MidiValue = number | string | Uint8Array;

/** Entrée d'état MIDI enrichie (métadonnées) stockée dans le StateStore. */
export interface MidiStateEntry {
  addr: MidiAddr;
  value: MidiValue;
  ts: number;
  origin: "app" | "xtouch";
  known: boolean;
  stale?: boolean;
  /** Empreinte utile pour SysEx (déduplication/trace). */
  hash?: string;
}

/** Clés d'application connues de la GW. */
export type AppKey = "voicemeeter" | "qlc" | "obs" | "midi-bridge";

/** Construit une clé unique pour une adresse MIDI (incluant le port). */
export function addrKey(addr: MidiAddr): string {
  const port = addr.portId ?? "";
  const s = addr.status;
  const ch = addr.channel ?? 0;
  const d1 = addr.data1 ?? 0;
  return `${port}|${s}|${ch}|${d1}`;
}

/** Calcule un hash SHA-1 sur un buffer SysEx pour identification/trace. */
export function computeHash(data: Uint8Array): string {
  const h = crypto.createHash("sha1");
  h.update(data);
  return h.digest("hex");
}


