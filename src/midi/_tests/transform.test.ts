import { describe, it, expect } from "vitest";
import { applyTransform } from "../transform";
import type { TransformConfig } from "../../config";

describe("midi/transform.applyTransform", () => {
  it("pb_to_note converts PB to NoteOn on same channel with mapped velocity", () => {
    const t: TransformConfig = { pb_to_note: { note: 12 } };
    // PB ch1, value14 ~ 8192 (center) → velocity ~ 64
    const pb = [0xE0, 0x00, 0x40];
    const out = applyTransform(pb, t);
    expect(out).toEqual([0x90, 12, 64]);
  });

  it("pb_to_cc converts PB to CC on target channel with base_cc (ch1 → base, ch2 → base+1)", () => {
    const t: TransformConfig = { pb_to_cc: { target_channel: 1, base_cc: "0x45" } };
    // Source PB on channel 3 (0-indexed 2) maps to CC base+3 = 0x48 on target ch1 (per current logic)
    const pbCh3 = [0xE0 + 2, 0x00, 0x7f]; // value14 ~ 16256 → value7 ~ 127
    const out = applyTransform(pbCh3, t);
    // Avec la règle ch1 → base (0x45), ch3 → base+(3-1) = 0x47
    expect(out).toEqual([0xB0 + 0, 0x47, 126]);
  });

  it("returns original data when not PitchBend or no transform applies", () => {
    const t: TransformConfig = { pb_to_cc: { target_channel: 1, base_cc: 45 } };
    const cc = [0xB0, 46, 10];
    expect(applyTransform(cc, t)).toEqual(cc);
  });
});


