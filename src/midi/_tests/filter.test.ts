import { describe, it, expect } from "vitest";
import { matchFilter } from "../filter";

describe("midi/filter.matchFilter", () => {
  it("passes when no filter provided", () => {
    expect(matchFilter([0x90, 60, 1])).toBe(true);
  });
  it("filters by channel and type, include/exclude notes", () => {
    // NoteOn ch1 note60
    const n = [0x90 + 0, 60, 1];
    expect(matchFilter(n, { channels: [1], types: ["noteOn"], includeNotes: [60] })).toBe(true);
    expect(matchFilter(n, { channels: [2] })).toBe(false);
    expect(matchFilter(n, { types: ["controlChange"] })).toBe(false);
    expect(matchFilter(n, { includeNotes: [61] })).toBe(false);
    expect(matchFilter(n, { excludeNotes: [60] })).toBe(false);
  });
  it("treats noteOn with velocity 0 as noteOff for filtering", () => {
    const d = [0x90 + 0, 60, 0];
    expect(matchFilter(d, { types: ["noteOff"] })).toBe(true);
  });
});


