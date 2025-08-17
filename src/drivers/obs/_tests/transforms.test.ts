import { describe, it, expect } from "vitest";
import { EncoderSpeedTracker } from "../transforms";

describe("EncoderSpeedTracker (EMA)", () => {
  const makeNow = () => {
    let t = 1000; // ms
    const fn = () => t;
    fn.advance = (ms: number) => { t += ms; };
    fn.set = (ms: number) => { t = ms; };
    return fn as (() => number) & { advance: (ms: number) => void; set: (ms: number) => void };
  };

  it("premier événement → accel=~1", () => {
    const now = makeNow();
    const tracker = new EncoderSpeedTracker({ now });
    const a = tracker.resolveAdaptiveDelta("enc6", 2);
    expect(a).toBeGreaterThanOrEqual(2);
    expect(a).toBeLessThanOrEqual(2 * 1.1);
  });

  it("lent (>500ms) → accel ≈ 1", () => {
    const now = makeNow();
    const tracker = new EncoderSpeedTracker({ now });
    tracker.resolveAdaptiveDelta("enc6", 2); // t=1000
    now.advance(600); // t=1600
    const a2 = tracker.resolveAdaptiveDelta("enc6", 2);
    expect(a2).toBeGreaterThanOrEqual(2);
    expect(a2).toBeLessThanOrEqual(2 * 2.0);
  });

  it("moyen (~300ms) → accel > 1 et raisonnable", () => {
    const now = makeNow();
    const tracker = new EncoderSpeedTracker({ now });
    tracker.resolveAdaptiveDelta("enc6", 2);
    now.advance(300);
    const a2 = tracker.resolveAdaptiveDelta("enc6", 2);
    expect(a2).toBeGreaterThan(2 * 1.1);
    expect(a2).toBeLessThanOrEqual(2 * 3);
  });

  it("rapide (~100ms) → accel sensiblement > 1", () => {
    const now = makeNow();
    const tracker = new EncoderSpeedTracker({ now });
    tracker.resolveAdaptiveDelta("enc6", 2);
    now.advance(100);
    const a2 = tracker.resolveAdaptiveDelta("enc6", 2);
    expect(a2).toBeGreaterThan(2 * 1.3);
    expect(a2).toBeLessThanOrEqual(2 * 8);
  });

  it("flip de direction → accel atténué", () => {
    const now = makeNow();
    const tracker = new EncoderSpeedTracker({ now });
    tracker.resolveAdaptiveDelta("enc6", 2); // init
    now.advance(100);
    const posFast = tracker.resolveAdaptiveDelta("enc6", 2);
    now.advance(100);
    const negFast = tracker.resolveAdaptiveDelta("enc6", -2);
    expect(negFast).toBeLessThan(Math.abs(posFast));
  });

  it("enc6/enc7 indépendants", () => {
    const now = makeNow();
    const tracker = new EncoderSpeedTracker({ now });
    tracker.resolveAdaptiveDelta("enc6", 2);
    tracker.resolveAdaptiveDelta("enc7", 2);
    now.advance(100);
    const a6 = tracker.resolveAdaptiveDelta("enc6", 2);
    now.advance(600);
    const a7 = tracker.resolveAdaptiveDelta("enc7", 2);
    expect(a6).toBeGreaterThan(2 * 1.2);
    expect(a7).toBeLessThanOrEqual(2 * 2.0);
  });
});


