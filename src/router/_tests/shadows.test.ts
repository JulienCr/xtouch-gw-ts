import { describe, it, expect } from "vitest";
import { makeAppShadows } from "../shadows";

describe("router/shadows", () => {
  it("creates and reuses app shadow maps; keys ignore port", () => {
    const s = makeAppShadows();
    const m1 = s.getAppShadow("qlc");
    const m2 = s.getAppShadow("qlc");
    expect(m1).toBe(m2);
    const k1 = s.addrKeyForXTouch({ status: "cc", channel: 1, data1: 46 } as any);
    const k2 = s.addrKeyForApp({ status: "cc", channel: 1, data1: 46, portId: "foo" } as any);
    expect(k1).toBe("cc|1|46");
    expect(k1).toBe(k2);
  });
});


