import type { TransformConfig } from "../config";
import { parseNumberMaybeHex } from "./utils";

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
      const value14 = (msb << 7) | lsb; // 0..16383
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
      const value14 = (msb << 7) | lsb; // 0..16383
      const value7 = Math.round((value14 / 16383) * 127);
      const targetChannel1 = Math.max(1, Math.min(16, t.pb_to_cc.target_channel ?? 1));
      const targetChannel0 = targetChannel1 - 1;
      // Resolve CC number
      let ccRaw: number | string | undefined = t.pb_to_cc.cc_by_channel?.[srcChannel1];
      if (ccRaw === undefined) {
        const baseRaw = t.pb_to_cc.base_cc ?? 45; // default base
        const base = parseNumberMaybeHex(baseRaw, 45);
        ccRaw = base + srcChannel1; // ch1 → base+1, etc.
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
export function applyReverseTransform(data: number[], t?: TransformConfig): number[] | null {
  if (!t) return data;
  const status = data[0] ?? 0;
  const typeNibble = (status & 0xf0) >> 4;
  const ch0 = status & 0x0f; // 0..15
  const ch1 = ch0 + 1; // 1..16

  // Reverse pb_to_note: Note -> PitchBend
  if (t.pb_to_note) {
    const noteCfg = Math.max(0, Math.min(127, t.pb_to_note.note ?? 0));
    if (typeNibble === 0x9) {
      const note = data[1] ?? 0;
      const vel = data[2] ?? 0;
      if (note === noteCfg) {
        const value14 = Math.round((vel / 127) * 16383);
        const lsb = value14 & 0x7f;
        const msb = (value14 >> 7) & 0x7f;
        const pbStatus = 0xE0 | ch0;
        return [pbStatus, lsb, msb];
      }
    }
    if (typeNibble === 0x8) {
      const note = data[1] ?? 0;
      if (note === noteCfg) {
        const pbStatus = 0xE0 | ch0;
        return [pbStatus, 0x00, 0x00];
      }
    }
  }

  // Reverse pb_to_cc: CC -> PitchBend
  if (t.pb_to_cc && typeNibble === 0xB) {
    const ccNum = data[1] ?? 0;
    const val7 = data[2] ?? 0;

    // Only consider feedback from the configured target channel if provided
    const targetCh = t.pb_to_cc.target_channel
      ? Math.max(1, Math.min(16, t.pb_to_cc.target_channel))
      : undefined;
    if (!targetCh || targetCh === ch1) {
      // Find src channel
      let srcCh1: number | undefined;
      if (t.pb_to_cc.cc_by_channel) {
        for (const [k, v] of Object.entries(t.pb_to_cc.cc_by_channel)) {
          const vNum = parseNumberMaybeHex(v as any, -1);
          if (vNum === ccNum) {
            const kNum = Number(k);
            if (Number.isFinite(kNum) && kNum >= 1 && kNum <= 16) {
              srcCh1 = kNum;
              break;
            }
          }
        }
      }
      if (srcCh1 === undefined) {
        const baseRaw = t.pb_to_cc.base_cc ?? 45;
        const base = parseNumberMaybeHex(baseRaw, 45);
        const candidate = ccNum - base;
        if (candidate >= 1 && candidate <= 16) srcCh1 = candidate;
      }
      if (srcCh1) {
        const value14 = Math.round((val7 / 127) * 16383);
        const lsb = value14 & 0x7f;
        const msb = (value14 >> 7) & 0x7f;
        const pbStatus = 0xE0 | ((srcCh1 - 1) & 0x0f);
        return [pbStatus, lsb, msb];
      }
    }
  }

  return data;
}


