import { describe, it, expect } from "vitest";
import { buildEntryFromRaw } from "../builders";

describe("state/builders.buildEntryFromRaw", () => {
  it("builds note, cc, pb entries and returns null for unknown", () => {
    const n = buildEntryFromRaw([0x90, 60, 10], "qlc");
    expect(n?.addr.status).toBe("note");
    const c = buildEntryFromRaw([0xB0, 46, 1], "qlc");
    expect(c?.addr.status).toBe("cc");
    const p = buildEntryFromRaw([0xE0, 0x00, 0x40], "qlc");
    expect(p?.addr.status).toBe("pb");
    const u = buildEntryFromRaw([0xC0, 10], "qlc");
    expect(u).toBeNull();
  });

  it("handles sysex and computes hash", () => {
    const s = buildEntryFromRaw([0xF0, 0x01, 0xF7], "qlc");
    expect(s?.addr.status).toBe("sysex");
    expect((s as any).hash).toMatch(/^[a-f0-9]{40}$/);
  });
});


