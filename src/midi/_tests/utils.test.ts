import { describe, it, expect } from "vitest";
import { hex, pb14FromRaw, rawFromPb14, getTypeNibble, isPB, isCC, isNoteOn, isNoteOff, parseNumberMaybeHex } from "../utils";

describe("midi/utils", () => {
  it("hex formats bytes to lowercase hex with spaces", () => {
    expect(hex([0x90, 0x00, 0x7f])).toBe("90 00 7f");
  });

  it("pb14FromRaw and rawFromPb14 are inverse within bounds", () => {
    const v0 = pb14FromRaw(0, 0);
    expect(v0).toBe(0);
    const vmax = pb14FromRaw(0x7f, 0x7f);
    expect(vmax).toBe(16383);

    const [st, lsb, msb] = rawFromPb14(1, 12345);
    expect(st).toBe(0xE0 + 0);
    expect(pb14FromRaw(lsb, msb)).toBe(12345);
  });

  it("type nibble helpers detect status types", () => {
    expect(getTypeNibble(0x90)).toBe(0x9);
    expect(isNoteOn(0x90)).toBe(true);
    expect(isNoteOff(0x80)).toBe(true);
    expect(isCC(0xB0)).toBe(true);
    expect(isPB(0xE0)).toBe(true);
  });

  it("parseNumberMaybeHex parses decimal and hex formats with fallback", () => {
    expect(parseNumberMaybeHex("0x45", 0)).toBe(0x45);
    expect(parseNumberMaybeHex("45h", 0)).toBe(0x45);
    expect(parseNumberMaybeHex("69", 0)).toBe(69);
    expect(parseNumberMaybeHex(undefined, 7)).toBe(7);
    expect(parseNumberMaybeHex("oops", 3)).toBe(3);
  });
});


