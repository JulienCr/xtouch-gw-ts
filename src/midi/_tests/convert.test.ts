import { describe, it, expect } from "vitest";
import {
  to7bitFrom14bit,
  to14bitFrom7bit,
  toPercentFrom14bit,
  to8bitFrom14bit,
  toNormalizedFrom14bit,
  to14bitFromNormalized,
} from "../convert";

describe("convert helpers", () => {
  it("bounds and monotonicity basic cases", () => {
    expect(to7bitFrom14bit(-1)).toBe(0);
    expect(to7bitFrom14bit(0)).toBe(0);
    expect(to7bitFrom14bit(16383)).toBe(127);
    expect(to7bitFrom14bit(8192)).toBeGreaterThanOrEqual(63);

    expect(to14bitFrom7bit(-1)).toBe(0);
    expect(to14bitFrom7bit(0)).toBe(0);
    expect(to14bitFrom7bit(127)).toBe(16383);
  });

  it("normalized roundtrips coarse", () => {
    const vals = [0, 0.25, 0.5, 0.75, 1];
    for (const n of vals) {
      const v14 = to14bitFromNormalized(n);
      const n2 = toNormalizedFrom14bit(v14);
      expect(n2).toBeGreaterThanOrEqual(0);
      expect(n2).toBeLessThanOrEqual(1);
    }
  });

  it("percent/8bit bounds", () => {
    expect(toPercentFrom14bit(16383)).toBe(100);
    expect(to8bitFrom14bit(16383)).toBe(255);
  });
});


