import { describe, it, expect } from "vitest";
import { resolveStepDelta } from "../transforms";

describe("obs/driver utils – resolveStepDelta", () => {
  it("uses base step when ctxValue is invalid", () => {
    expect(resolveStepDelta(undefined, undefined, 2)).toBe(2);
    expect(resolveStepDelta(5, undefined, 2)).toBe(5);
  });

  it("returns +step for 1..63 and -step for 65..127; 0/64 -> 0", () => {
    expect(resolveStepDelta(undefined, 1, 2)).toBe(2);
    expect(resolveStepDelta(undefined, 63, 2)).toBe(2);
    expect(resolveStepDelta(undefined, 64, 2)).toBe(0);
    expect(resolveStepDelta(undefined, 0, 2)).toBe(0);
    expect(resolveStepDelta(undefined, 65, 2)).toBe(-2);
    expect(resolveStepDelta(undefined, 127, 2)).toBe(-2);
  });
});


