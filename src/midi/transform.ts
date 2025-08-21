import type { TransformConfig } from "../config";
import { parseNumberMaybeHex, pb14FromRaw } from "./utils";

/**
 * Transformations sortantes (X-Touch → cible).
 */
export function applyTransform(data: number[], t?: TransformConfig): number[] | null {
  if (!t) return data;
  // PitchBend → NoteOn
  if (t.pb_to_note) {
    const status = data[0] ?? 0;
    const typeNibble = (status & 0xf0) >> 4;
    if (typeNibble === 0xE) {
      const channelNibble = status & 0x0f; // 0..15
      const lsb = data[1] ?? 0; // 0..127
      const msb = data[2] ?? 0; // 0..127
      const value14 = pb14FromRaw(lsb, msb); // 0..16383
      const velocity = Math.round((value14 / 16383) * 127);
      const note = Math.max(0, Math.min(127, t.pb_to_note.note ?? 0));
      const noteOnStatus = 0x90 | channelNibble;
      return [noteOnStatus, note, velocity];
    }
  }

  // PitchBend → ControlChange
  if (t.pb_to_cc) {
    const status = data[0] ?? 0;
    const typeNibble = (status & 0xf0) >> 4;
    if (typeNibble === 0xE) {
      const srcChannel0 = status & 0x0f; // 0..15
      const srcChannel1 = srcChannel0 + 1; // 1..16
      const lsb = data[1] ?? 0;
      const msb = data[2] ?? 0;
      const value14 = pb14FromRaw(lsb, msb); // 0..16383
      const value7 = Math.round((value14 / 16383) * 127);
      const targetChannel1 = Math.max(1, Math.min(16, t.pb_to_cc.target_channel ?? 1));
      const targetChannel0 = targetChannel1 - 1;
      // Resolve CC number
      let ccRaw: number | string | undefined = t.pb_to_cc.cc_by_channel?.[srcChannel1];
      if (ccRaw === undefined) {
        const baseRaw = t.pb_to_cc.base_cc ?? 45; // default base
        const base = parseNumberMaybeHex(baseRaw, 45);
        ccRaw = base + (srcChannel1 - 1); // ch1 → base, ch2 → base+1, etc.
      }
      let cc = parseNumberMaybeHex(ccRaw, 0);
      cc = Math.max(0, Math.min(127, cc));
      const ccStatus = 0xB0 | targetChannel0;
      return [ccStatus, cc, value7];
    }
  }

  return data;
}

/**
 * Transformations inverses pour feedback (cible → X-Touch).
 */
// Note: reverse transformations are now handled by the router/page mapping layer.


