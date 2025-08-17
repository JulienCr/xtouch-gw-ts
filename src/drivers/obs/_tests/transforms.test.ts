import { describe, it, expect } from "vitest";
import { buildTransformUpdate, computeAnchorFromAlignment, type ObsItemState } from "../transforms";

describe("obs/transforms – anchors", () => {
  it("computes center anchors for CENTER (=0) and undefined", () => {
    expect(computeAnchorFromAlignment(undefined)).toEqual({ anchorX: 0.5, anchorY: 0.5 });
    expect(computeAnchorFromAlignment(0)).toEqual({ anchorX: 0.5, anchorY: 0.5 });
  });

  it("computes anchors for LEFT/TOP and RIGHT/BOTTOM", () => {
    expect(computeAnchorFromAlignment(1 | 4)).toEqual({ anchorX: 0, anchorY: 0 }); // LEFT+TOP
    expect(computeAnchorFromAlignment(2 | 8)).toEqual({ anchorX: 1, anchorY: 1 }); // RIGHT+BOTTOM
  });
});

describe("obs/transforms – buildTransformUpdate (no bounds)", () => {
  const base: ObsItemState = { x: 10, y: 20, scale: 1, width: 100, height: 50, alignment: 0 };

  it("scales multiplicatively and keeps position with CENTER alignment", () => {
    const { sceneItemTransform, next } = buildTransformUpdate(base, { ds: 0.1 });
    expect(sceneItemTransform).toMatchObject({ scaleX: 1.1, scaleY: 1.1 });
    // Center anchor → position unchanged
    expect(sceneItemTransform.positionX).toBe(10);
    expect(sceneItemTransform.positionY).toBe(20);
    expect(next.scale).toBeCloseTo(1.1);
    expect(next.x).toBe(10);
    expect(next.y).toBe(20);
  });

  it("shifts position to preserve visual center with LEFT/TOP alignment", () => {
    const cur: ObsItemState = { ...base, alignment: 1 | 4 };
    const { sceneItemTransform, next } = buildTransformUpdate(cur, { ds: 0.1 });
    // w=100,h=50 → w2=110,h2=55; dx=(0.5-0)*(100-110)=-5; dy=(0.5-0)*(50-55)=-2.5
    expect(sceneItemTransform).toMatchObject({ scaleX: 1.1, scaleY: 1.1 });
    expect(sceneItemTransform.positionX).toBeCloseTo(10 - 5);
    expect(sceneItemTransform.positionY).toBeCloseTo(20 - 2.5);
    expect(next.x).toBeCloseTo(10 - 5);
    expect(next.y).toBeCloseTo(20 - 2.5);
  });
});

describe("obs/transforms – buildTransformUpdate (with bounds)", () => {
  const base: ObsItemState = { x: 0, y: 0, scale: 1, boundsW: 200, boundsH: 100, alignment: 0 };

  it("updates boundsWidth/Height and keeps center with CENTER alignment", () => {
    const { sceneItemTransform, next } = buildTransformUpdate(base, { ds: 0.2 });
    // 200→240, 100→120; center → pos unchanged
    expect(sceneItemTransform).toMatchObject({ boundsWidth: 240, boundsHeight: 120, positionX: 0, positionY: 0 });
    expect(next.boundsW).toBe(240);
    expect(next.boundsH).toBe(120);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it("shifts position with LEFT/TOP alignment to keep visual center", () => {
    const cur: ObsItemState = { ...base, x: 10, y: 20, alignment: 1 | 4 };
    const { sceneItemTransform, next } = buildTransformUpdate(cur, { ds: 0.1 });
    // w=200→220, h=100→110; dx=(0.5-0)*(200-220)=-10; dy=(0.5-0)*(100-110)=-5
    expect(sceneItemTransform.boundsWidth).toBe(220);
    expect(sceneItemTransform.boundsHeight).toBe(110);
    expect(sceneItemTransform.positionX).toBeCloseTo(10 - 10);
    expect(sceneItemTransform.positionY).toBeCloseTo(20 - 5);
    expect(next.x).toBeCloseTo(0);
    expect(next.y).toBeCloseTo(15);
  });
});


