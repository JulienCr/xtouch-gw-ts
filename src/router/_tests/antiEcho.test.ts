import { describe, it, expect } from "vitest";
import { midiValueEquals, getAntiLoopMs } from "../antiEcho";

describe("router/antiEcho", () => {
  it("midiValueEquals compares numbers/strings directly and Uint8Array bitwise", () => {
    expect(midiValueEquals(1, 1)).toBe(true);
    expect(midiValueEquals(1, 2)).toBe(false);
    expect(midiValueEquals("a", "a")).toBe(true);
    expect(midiValueEquals("a", "b")).toBe(false);
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 2, 4]);
    expect(midiValueEquals(a, b)).toBe(true);
    expect(midiValueEquals(a, c)).toBe(false);
  });

  it("getAntiLoopMs returns mapped value or default 60", () => {
    const win = { note: 10, cc: 20, pb: 30, sysex: 40 } as any;
    expect(getAntiLoopMs(win, "note" as any)).toBe(10);
    expect(getAntiLoopMs(win, "cc" as any)).toBe(20);
    expect(getAntiLoopMs({} as any, "pb" as any)).toBe(60);
  });
});


