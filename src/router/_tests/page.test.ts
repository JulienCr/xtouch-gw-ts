import { describe, it, expect } from "vitest";
import { getAppsForPage, getChannelsForApp, resolvePbToCcMappingForApp } from "../page";
import type { PageConfig } from "../../config";

function pageWith(
  passthroughs: Array<{
    to_port: string;
    from_port: string;
    channels?: number[];
    base_cc?: number | string;
    cc_by_channel?: Record<number, number | string>;
  }>
): PageConfig {
  return {
    name: "P",
    controls: {},
    passthroughs: passthroughs.map((p) => ({
      driver: "midi",
      to_port: p.to_port,
      from_port: p.from_port,
      filter: p.channels ? { channels: p.channels } : undefined,
      transform: p.base_cc || p.cc_by_channel ? { pb_to_cc: { target_channel: 1, base_cc: p.base_cc as any, cc_by_channel: p.cc_by_channel } } : undefined,
    })),
  } as any;
}

describe("router/page helpers", () => {
  it("getAppsForPage returns unique apps from passthroughs or default voicemeeter", () => {
    const p1 = pageWith([]);
    expect(getAppsForPage(p1)).toEqual(["voicemeeter"]);
    const p2 = pageWith([
      { to_port: "qlc-in", from_port: "qlc-out" },
      { to_port: "xtouch-gw", from_port: "xtouch-gw-feedback" },
      { to_port: "qlc-aux", from_port: "qlc-aux" },
    ]);
    expect(getAppsForPage(p2)).toEqual(["qlc", "voicemeeter"]);
  });

  it("getChannelsForApp collects from filters and pb_to_cc config, defaults to 1..9", () => {
    const p = pageWith([
      { to_port: "qlc-in", from_port: "qlc-out", channels: [2, 3], base_cc: "0x45" },
      { to_port: "qlc-aux", from_port: "qlc-aux", cc_by_channel: { 7: 70 } },
    ]);
    const chs = getChannelsForApp(p, "qlc");
    expect(chs).toEqual([2, 3, 7, 1, 4, 5, 6, 8, 9].sort((a,b)=>a-b));
  });

  it("resolvePbToCcMappingForApp mixes cc_by_channel over base_cc and builds reverse map", () => {
    const p = pageWith([
      { to_port: "qlc-in", from_port: "qlc-out", base_cc: 0x45, cc_by_channel: { 2: 0x49 } },
    ]);
    const m = resolvePbToCcMappingForApp(p, "qlc");
    expect(m).not.toBeNull();
    const map = m!.map;
    // base: ch1->0x45, ch2 overridden -> 0x49, ch3->0x47
    expect(map.get(1)).toBe(0x45);
    expect(map.get(2)).toBe(0x49);
    expect(map.get(3)).toBe(0x47);
    // Reverse map keeps the last writer for duplicate CCs (base may collide with explicit mapping)
    expect(m!.channelForCc.get(0x49)).toBe(5);
  });
});


