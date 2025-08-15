import { human, hex, rawFromPb14 } from "../midi/utils";
import type { MidiStateEntry } from "../state";
import type { XTouchDriver } from "../xtouch/driver";
import { midiValueEquals, getAntiLoopMs } from "./antiEcho";
import { logger } from "../logger";

/**
 * Options de construction de l'émetteur X‑Touch.
 */
export interface XTouchEmitterOptions {
  /** Fenêtres anti‑echo (ms) par type d'évènement MIDI. */
  antiLoopWindows: Record<import("../state").MidiStatus, number>;
  /** Génère une clé d'adresse X‑Touch sans port pour le shadow/dup detection. */
  getAddrKeyWithoutPort: (addr: MidiStateEntry["addr"]) => string;
  /** Marque une action locale (LWW) lors d'un envoi simulé. */
  markLocalActionTs?: (key: string, ts: number) => void;
  /** Active le log trace des PB envoyés. */
  logPitchBend?: boolean;
}

/**
 * Construit un émetteur responsable de l'ordonnancement et des protections anti-echo vers X‑Touch.
 */
 * Construit un émetteur responsable de l'ordonnancement et des protections anti‑echo vers X‑Touch.
 *
 * @param x - Driver X‑Touch cible
 * @param options - Options de configuration de l'émetteur
 * @returns API { send, entryToRaw, emitIfNotDuplicate, clearShadow }
 */
export function makeXTouchEmitter(
  x: XTouchDriver,
  options: XTouchEmitterOptions
) {
  const { antiLoopWindows, getAddrKeyWithoutPort, markLocalActionTs, logPitchBend } = options;
  const shadow = new Map<string, { value: MidiStateEntry["value"]; ts: number }>();

  function entryToRaw(entry: MidiStateEntry): number[] | null {
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
        const v14 = typeof value === "number" ? Math.max(0, Math.min(16383, Math.floor(value))) : 8192;
        const [status, lsb, msb] = rawFromPb14(ch, v14);
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

  function emitIfNotDuplicate(entry: MidiStateEntry, prebuilt?: number[]) {
    const k = getAddrKeyWithoutPort(entry.addr as any);
    const prev = shadow.get(k);
    const now = Date.now();
    const win = getAntiLoopMs(antiLoopWindows, entry.addr.status);
    if (prev && midiValueEquals(prev.value, entry.value) && now - prev.ts < win) {
      return;
    }
    const bytes = prebuilt ?? entryToRaw(entry);
    if (!bytes) return;
    x.sendRawMessage(bytes);
    shadow.set(k, { value: entry.value, ts: now });
  }

  /** Envoie une liste d'entrées avec l'ordonnancement Notes→CC→SysEx→PB. */
  function send(entries: MidiStateEntry[]): void {
    // Ordonnancement: Notes -> CC -> SysEx -> PitchBend
    const notes = entries.filter((e) => e.addr.status === "note");
    const ccs = entries.filter((e) => e.addr.status === "cc");
    const syx = entries.filter((e) => e.addr.status === "sysex");
    const pbs = entries.filter((e) => e.addr.status === "pb");

    // Anti-boucle moteurs: ignorer les PB entrants depuis X-Touch pendant le temps d'établissement
    try { x.squelchPitchBend(120); } catch {}

    const batches = [notes, ccs, syx, pbs];
    for (const batch of batches) {
      for (const e of batch) {
        const bytes = entryToRaw(e);
        if (!bytes) continue;
        if (markLocalActionTs) {
          try { markLocalActionTs(getAddrKeyWithoutPort(e.addr as any), Date.now()); } catch {}
        }
        emitIfNotDuplicate(e, bytes);
        if (logPitchBend && e.addr.status === "pb") {
          try { logger.trace(`Send PB -> X-Touch: ${human(bytes)} [${hex(bytes)}]`); } catch {}
        }
      }
    }
  }

  /** Réinitialise l'ombre interne (autorise la ré‑émission des valeurs). */
  function clearShadow() {
    shadow.clear();
  }

  return { send, entryToRaw, emitIfNotDuplicate, clearShadow };
}


