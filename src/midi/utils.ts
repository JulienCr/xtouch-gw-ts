import { decodeMidi, formatDecoded } from "./decoder";

/**
 * Retourne une représentation hexadécimale lisible (ex: "90 00 7f").
 */
export function hex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * Retourne une description humaine (type, canal, contrôleur, etc.) d'une trame MIDI.
 */
export function human(bytes: number[]): string {
  try {
    const evt = decodeMidi(bytes);
    if (evt.type === "controlChange") {
      const ccHex = `0x${evt.controller.toString(16)}`;
      const valHex = `0x${evt.value.toString(16)}`;
      return `CC ch=${evt.channel} cc=${evt.controller} (${ccHex}) val=${evt.value} (${valHex})`;
    }
    if (evt.type === "noteOn" || evt.type === "noteOff") {
      const nHex = `0x${evt.note.toString(16)}`;
      const vHex = `0x${evt.velocity.toString(16)}`;
      const t = evt.type === "noteOn" ? "NoteOn" : "NoteOff";
      return `${t} ch=${evt.channel} note=${evt.note} (${nHex}) vel=${evt.velocity} (${vHex})`;
    }
    if (evt.type === "pitchBend") {
      return `PitchBend ch=${evt.channel} val14=${evt.value14} norm=${evt.normalized.toFixed(3)}`;
    }
    return formatDecoded(evt);
  } catch {
    return "Unknown";
  }
}

/**
 * Parse un nombre qui peut être décimal ou hex (ex: "0x45", "45h", "45").
 */
export function parseNumberMaybeHex(value: number | string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    // Support formats: "0x45", "45h", "45"
    if (/^0x[0-9a-f]+$/i.test(trimmed)) return parseInt(trimmed, 16);
    if (/^[0-9a-f]+h$/i.test(trimmed)) return parseInt(trimmed.slice(0, -1), 16);
    const asDec = Number(trimmed);
    if (Number.isFinite(asDec)) return asDec as number;
  }
  return fallback;
}

/**
 * Extrait le type (nibble haut) d'un status MIDI (0x8/0x9/0xB/0xE...).
 */
export function getTypeNibble(status: number): number {
  return (status & 0xf0) >> 4;
}

/** Indique si la trame est un Pitch Bend. */
export function isPB(status: number): boolean { return getTypeNibble(status) === 0xE; }
/** Indique si la trame est un Control Change. */
export function isCC(status: number): boolean { return getTypeNibble(status) === 0xB; }
/** Indique si la trame est un Note On. */
export function isNoteOn(status: number): boolean { return getTypeNibble(status) === 0x9; }
/** Indique si la trame est un Note Off. */
export function isNoteOff(status: number): boolean { return getTypeNibble(status) === 0x8; }

/**
 * Calcule la valeur 14 bits d'un PitchBend à partir des octets LSB/MSB.
 */
export function pb14FromRaw(lsb: number, msb: number): number {
  return ((msb & 0x7f) << 7) | (lsb & 0x7f);
}

/**
 * Construit les 3 octets MIDI d'un PitchBend pour un canal donné à partir d'une valeur 14 bits.
 * Retourne [status, lsb, msb].
 */
export function rawFromPb14(channel: number, value14: number): [number, number, number] {
  const ch = Math.max(1, Math.min(16, channel | 0));
  const status = 0xE0 + (ch - 1);
  const v = Math.max(0, Math.min(16383, value14 | 0));
  const lsb = v & 0x7f;
  const msb = (v >> 7) & 0x7f;
  return [status, lsb, msb];
}


