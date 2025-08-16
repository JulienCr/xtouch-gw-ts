import { describe, it, expect } from "vitest";
import { addrKeyWithoutPort, addrKeyWithPort } from "../addrKey";

describe("shared/addrKey", () => {
  it("addrKeyWithoutPort builds status|channel|data1", () => {
    expect(addrKeyWithoutPort({ status: "note", channel: 2, data1: 10 } as any)).toBe("note|2|10");
  });
  it("addrKeyWithPort builds key including portId", () => {
    const k = addrKeyWithPort({ portId: "qlc", status: "note", channel: 2, data1: 10 } as any);
    expect(k).toBe("qlc|note|2|10");
  });
});


