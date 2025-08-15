import type { MidiStatus } from "../state";
import type { MidiValue } from "../state";

/**
 * Compare deux valeurs MIDI pour l'anti-echo.
 *
 * @param a - Valeur MIDI (nombre, chaîne, ou buffer SysEx)
 * @param b - Valeur MIDI (nombre, chaîne, ou buffer SysEx)
 * @returns true si les valeurs sont identiques (égalité stricte ou bit-à-bit pour SysEx)
 */
export function midiValueEquals(a: MidiValue, b: MidiValue): boolean {
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }
  return (a as any) === (b as any);
}

/**
 * Retourne la fenêtre anti-boucle (ms) pour un type d'évènement MIDI donné.
 *
 * @param windows - Fenêtres anti-boucle par type d'évènement MIDI
 * @param status - Type d'évènement MIDI (note, cc, pb, sysex)
 * @returns Durée en millisecondes de la fenêtre anti-boucle
 */
export function getAntiLoopMs(
  windows: Record<MidiStatus, number>,
  status: MidiStatus
): number {
  return (windows as any)[status] ?? 60;
}


