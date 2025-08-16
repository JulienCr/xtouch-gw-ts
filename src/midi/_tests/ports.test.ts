import { describe, it, expect } from "vitest";
import { findPortIndexByNameFragment } from "../ports";

describe("midi/ports.findPortIndexByNameFragment", () => {
  it("finds index by case-insensitive substring and returns null otherwise", () => {
    const dev = {
      getPortCount: () => 3,
      getPortName: (i: number) => ["Foo IN", "Bar OUT", "QLC Port"][i],
    } as any;
    expect(findPortIndexByNameFragment(dev, "foo")).toBe(0);
    expect(findPortIndexByNameFragment(dev, "QLC")).toBe(2);
    expect(findPortIndexByNameFragment(dev, "Nope")).toBeNull();
  });
});


