/**
 * JSDoc: Helpers de construction de trames MIDI (status/data) pour Note/CC/PB.
 *
 * Conserve la sémantique CommonJS du projet. Ces fonctions bornent et normalisent
 * les entrées, et renvoient des tableaux d'octets prêts à l'envoi.
 */

/** Construit un Note On (status 0x9) — [status, note, velocity]. */
export function rawFromNoteOn(channel: number, note: number, velocity: number): [number, number, number] {
  const ch = Math.max(1, Math.min(16, channel | 0)) - 1;
  const n = Math.max(0, Math.min(127, note | 0));
  const v = Math.max(0, Math.min(127, velocity | 0));
  return [(0x90 | ch), n, v];
}

/** Construit un Note Off (status 0x8) — [status, note, velocity]. */
export function rawFromNoteOff(channel: number, note: number, velocity: number = 0): [number, number, number] {
  const ch = Math.max(1, Math.min(16, channel | 0)) - 1;
  const n = Math.max(0, Math.min(127, note | 0));
  const v = Math.max(0, Math.min(127, velocity | 0));
  return [(0x80 | ch), n, v];
}

/** Construit un Control Change (status 0xB) — [status, controller, value7]. */
export function rawFromControlChange(channel: number, controller: number, value7: number): [number, number, number] {
  const ch = Math.max(1, Math.min(16, channel | 0)) - 1;
  const c = Math.max(0, Math.min(127, controller | 0));
  const v = Math.max(0, Math.min(127, value7 | 0));
  return [(0xB0 | ch), c, v];
}

/** Construit un Pitch Bend 14 bits via [status, lsb, msb]. */
export { rawFromPb14 } from "./utils";


