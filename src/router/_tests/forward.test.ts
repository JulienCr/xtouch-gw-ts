import { describe, it, expect, vi } from "vitest";
import { forwardFromApp } from "../forward";
import type { MidiStateEntry } from "../../state";
import type { PageConfig } from "../../config";
import { addrKey } from "../../state";

function makePage(): PageConfig {
  return {
    name: "Test",
    passthroughs: [
      {
        driver: "midi",
        to_port: "qlc-in",
        from_port: "qlc-out",
        filter: { channels: [1] },
        transform: { pb_to_cc: { target_channel: 1, base_cc: "0x45" } },
      },
    ],
    controls: {},
  } as any;
}

function ccEntry(value: number, ts: number): MidiStateEntry {
  return {
    // Use CC matching channel 1 per page mapping base_cc (0x45 + (ch-1)) → ch1 => 0x45
    addr: { portId: "qlc", status: "cc", channel: 1, data1: 0x45 },
    value,
    ts,
    origin: "app",
    known: true,
  } as MidiStateEntry;
}

describe("router/forwardFromApp", () => {
  it("skips duplicate feedback within anti-loop window (same value, rtt < win)", () => {
    const emit = vi.fn();
    const page = makePage();
    const now = Date.now();
    const entry = ccEntry(64, now);
    const k = addrKey(entry.addr);
    const deps = {
      hasXTouch: () => true,
      getActivePage: () => page,
      getAppShadow: () => new Map([[k, { value: 64, ts: now - 10 }]]),
      addrKeyForApp: (a: MidiStateEntry["addr"]) => addrKey(a),
      addrKeyForXTouch: (a: MidiStateEntry["addr"]) => `${a.portId}|${a.status}|${a.channel}|${a.data1}`,
      ensureLatencyMeters: () => ({ note: { record: vi.fn() }, cc: { record: vi.fn() }, pb: { record: vi.fn() }, sysex: { record: vi.fn() } } as any),
      antiLoopWindows: { note: 80, cc: 80, pb: 120, sysex: 200 } as any,
      lastUserActionTs: new Map<string, number>(),
      emitIfNotDuplicate: emit,
    } as any;
    forwardFromApp(deps, "qlc", entry);
    expect(emit).not.toHaveBeenCalled();
  });

  it("skips when last local user action within grace window", () => {
    const emit = vi.fn();
    const page = makePage();
    const now = Date.now();
    const entry = ccEntry(65, now);
    // No prev to trigger anti-echo path; but local grace should block after transform (CC->PB ch1)
    const deps = {
      hasXTouch: () => true,
      getActivePage: () => page,
      getAppShadow: () => new Map(),
      addrKeyForApp: (a: MidiStateEntry["addr"]) => addrKey(a),
      addrKeyForXTouch: (a: MidiStateEntry["addr"]) => `${a.portId}|${a.status}|${a.channel}|${a.data1}`,
      ensureLatencyMeters: () => ({ note: { record: vi.fn() }, cc: { record: vi.fn() }, pb: { record: vi.fn() }, sysex: { record: vi.fn() } } as any),
      antiLoopWindows: { note: 80, cc: 80, pb: 120, sysex: 200 } as any,
      lastUserActionTs: new Map<string, number>(),
      emitIfNotDuplicate: emit,
    } as any;
    // Compute target key matching transformed PB (for CC ch1 → PB ch1)
    const targetKey = deps.addrKeyForXTouch({ portId: "qlc", status: "pb", channel: 1, data1: 0 } as any);
    deps.lastUserActionTs.set(targetKey, now - 50); // grace for PB is 300ms → should block
    forwardFromApp(deps, "qlc", entry);
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits when not duplicate and outside grace", () => {
    const emit = vi.fn();
    const page = makePage();
    const now = Date.now();
    const entry = ccEntry(66, now);
    const deps = {
      hasXTouch: () => true,
      getActivePage: () => page,
      getAppShadow: () => new Map(),
      addrKeyForApp: (a: MidiStateEntry["addr"]) => addrKey(a),
      addrKeyForXTouch: (a: MidiStateEntry["addr"]) => `${a.portId}|${a.status}|${a.channel}|${a.data1}`,
      ensureLatencyMeters: () => ({ note: { record: vi.fn() }, cc: { record: vi.fn() }, pb: { record: vi.fn() }, sysex: { record: vi.fn() } } as any),
      antiLoopWindows: { note: 80, cc: 80, pb: 120, sysex: 200 } as any,
      lastUserActionTs: new Map<string, number>(),
      emitIfNotDuplicate: emit,
    } as any;
    forwardFromApp(deps, "qlc", entry);
    // In some pages mapping logic, cc->pb may produce multiple forwards for different channels; assert at least one PB ch1 exists
    expect(emit).toHaveBeenCalled();
    const forwards = (emit as any).mock.calls.map((c: any) => c[0] as MidiStateEntry);
    const hasPbCh1 = forwards.some((f: MidiStateEntry) => f.addr.status === "pb" && f.addr.channel === 1);
    expect(hasPbCh1).toBe(true);
  });
});


