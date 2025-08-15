import { getTypeNibble, pb14FromRaw } from "../midi/utils";
import type { MidiStateEntry } from "./types";
import { computeHash } from "./types";

/**
 * Construit une entrée de state à partir d'une trame MIDI brute.
 * - NoteOn/NoteOff → value = vélocité (0 = off)
 * - CC → value = 0..127
 * - PB → value = 0..16383 (14 bits)
 * - SysEx → value = Uint8Array (payload complet)
 */
export function buildEntryFromRaw(raw: number[], portId: string): MidiStateEntry | null {
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

  const typeNibble = getTypeNibble(status);
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
    const value14 = pb14FromRaw(d1, d2);
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


