import { describe, it, expect } from "vitest";
import { StateStore } from "../store";
import type { MidiStateEntry } from "../types";

function makeEntry(partial: Partial<MidiStateEntry>): MidiStateEntry {
  return {
    addr: { portId: "qlc", status: "cc", channel: 1, data1: 46 },
    value: 10,
    ts: Date.now(),
    origin: "app",
    known: true,
    ...partial,
  } as MidiStateEntry;
}

describe("state/StateStore", () => {
  it("updateFromFeedback stores entry as known=app and publishes to subscribers", () => {
    const s = new StateStore();
    let published: MidiStateEntry | null = null;
    const unsubscribe = s.subscribe((e) => { published = e; });
    const e = makeEntry({ value: 42 });
    s.updateFromFeedback("qlc", e);
    const exact = s.getStateForApp("qlc", e.addr);
    expect(exact?.known).toBe(true);
    expect(exact?.origin).toBe("app");
    expect(published?.value).toBe(42);
    unsubscribe();
  });

  it("getKnownLatestForApp selects the most recent matching entry regardless of portId", async () => {
    const s = new StateStore();
    const e1 = makeEntry({ addr: { portId: "qlc-A", status: "cc", channel: 1, data1: 46 }, ts: 1, value: 11 });
    const e2 = makeEntry({ addr: { portId: "qlc-B", status: "cc", channel: 1, data1: 46 }, ts: 2, value: 22 });
    s.updateFromFeedback("qlc", e1);
    s.updateFromFeedback("qlc", e2);
    const latest = s.getKnownLatestForApp("qlc", "cc", 1, 46);
    expect(latest?.value).toBe(22);
  });

  it("listStatesForApp returns entries for that app only", () => {
    const s = new StateStore();
    s.updateFromFeedback("qlc", makeEntry({ value: 1 }));
    s.updateFromFeedback("voicemeeter", makeEntry({ addr: { portId: "vm", status: "note", channel: 1, data1: 0 }, value: 2 } as any));
    const qlc = s.listStatesForApp("qlc");
    const vm = s.listStatesForApp("voicemeeter");
    expect(qlc.length).toBe(1);
    expect(vm.length).toBe(1);
  });
});


