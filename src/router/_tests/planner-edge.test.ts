import { describe, it, expect } from "vitest";
import { planRefresh } from "../planner";
import type { PageConfig } from "../../config";
import { StateStore } from "../../state";

function pageNoMapping(): PageConfig {
  return {
    name: "NoMap",
    controls: {},
    passthroughs: [
      { driver: "midi", to_port: "qlc-in", from_port: "qlc-out", filter: { channels: [1] } },
    ],
  } as any;
}

describe("router/planRefresh edge cases", () => {
  it("generates PB=0 (low priority) when no known PB/CC mapping exists for channel", () => {
    const page = pageNoMapping();
    const state = new StateStore();
    // no known PB or CC in state
    const entries = planRefresh(page, state);
    const pbs = entries.filter((e) => e.addr.status === "pb");
    expect(pbs.length).toBeGreaterThan(0);
    // PB for channel 1 exists with value 0 and known=false
    const pbCh1 = pbs.find((e) => e.addr.channel === 1);
    expect(pbCh1?.value).toBe(0);
    expect(pbCh1?.known).toBe(false);
  });
});


