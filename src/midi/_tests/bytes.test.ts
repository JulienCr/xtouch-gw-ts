import { describe, it, expect } from "vitest";
import { rawFromNoteOn, rawFromNoteOff, rawFromControlChange } from "../bytes";

describe("bytes helpers", () => {
  it("note on/off status and bounds", () => {
    expect(rawFromNoteOn(1, 0, 127)).toEqual([0x90, 0, 127]);
    expect(rawFromNoteOff(1, 0, 0)).toEqual([0x80, 0, 0]);
    expect(rawFromNoteOn(16, 200, 999)).toEqual([0x9f, 127, 127]);
  });

  it("control change status and bounds", () => {
    expect(rawFromControlChange(1, 0, 0)).toEqual([0xB0, 0, 0]);
    expect(rawFromControlChange(16, 200, -1)).toEqual([0xBF, 127, 0]);
  });
});


