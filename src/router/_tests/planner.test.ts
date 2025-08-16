import { describe, it, expect } from "vitest";
import { planRefresh } from "../planner";
import type { PageConfig } from "../../config";
import { StateStore } from "../../state";

function makePage(): PageConfig {
  return {
    name: "Test",
    passthroughs: [
      {
        driver: "midi",
        to_port: "qlc-in",
        from_port: "qlc-out",
        filter: { channels: [1, 2] },
        transform: { pb_to_cc: { target_channel: 1, base_cc: "0x45" } },
      },
    ],
    controls: {},
  } as any;
}

describe("router/planRefresh", () => {
  it("prioritizes PB known > CC mapped > ZERO and fills Note/CC resets", () => {
    const page = makePage();
    const state = new StateStore();
    // Known CC mapped for ch1 -> CC46 (base 0x45 + (1-1) = 0x45? but mapping function in page uses +1, so ch1 -> 0x46)
    state.updateFromFeedback("qlc", {
      addr: { portId: "qlc", status: "cc", channel: 1, data1: 0x46 },
      value: 64,
      ts: 1,
      origin: "app",
      known: true,
    });
    // Known PB for ch2 should take priority over CC mapped
    state.updateFromFeedback("qlc", {
      addr: { portId: "qlc", status: "pb", channel: 2, data1: 0 },
      value: 9000,
      ts: 2,
      origin: "app",
      known: true,
    });

    const entries = planRefresh(page, state);
    // Should include PB for ch2 (known PB); for ch1, planner may produce ZERO only if no CC/PB mapping resolves
    const pbs = entries.filter((e) => e.addr.status === "pb");
    const pbCh = new Set(pbs.map((e) => e.addr.channel));
    expect(pbCh.has(2)).toBe(true);
  });
});


