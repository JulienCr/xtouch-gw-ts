import { describe, it, expect } from "vitest";
import { LatencyMeter, attachLatencyExtensions } from "../latency";

describe("router/latency", () => {
  it("LatencyMeter records, summarizes and resets", () => {
    const m = new LatencyMeter();
    m.record(10);
    m.record(30);
    const s1 = m.summary();
    expect(s1.count).toBe(2);
    expect(s1.last).toBe(30);
    expect(s1.p50).toBeGreaterThan(0);
    expect(s1.max).toBe(30);
    m.reset();
    const s2 = m.summary();
    expect(s2.count).toBe(0);
    expect(s2.last).toBe(0);
  });

  it("attachLatencyExtensions injects methods on Router prototype", () => {
    class DummyRouter {
      latencyMeters: any = { qlc: { note: new LatencyMeter(), cc: new LatencyMeter(), pb: new LatencyMeter(), sysex: new LatencyMeter() } };
      antiLoopWindowMsByStatus: any = { note: 10 };
    }
    attachLatencyExtensions(DummyRouter);
    const r: any = new DummyRouter();
    const report = r.getLatencyReport();
    expect(report.qlc.note.count).toBe(0);
    expect(r.getAntiLoopMs("note")).toBe(10);
    r.resetLatency();
    expect(r.getLatencyReport().qlc.pb.count).toBe(0);
  });
});


