export interface ObsItemState {
  x: number;
  y: number;
  scale: number;
  width?: number;
  height?: number;
  boundsW?: number;
  boundsH?: number;
  alignment?: number; // libOBS: LEFT=1, RIGHT=2, TOP=4, BOTTOM=8; CENTER=0
}

export interface ObsDelta { dx?: number; dy?: number; ds?: number }

export function computeAnchorFromAlignment(alignment: number | undefined): { anchorX: number; anchorY: number } {
  const a = alignment ?? 0;
  const left = (a & 1) !== 0; const right = (a & 2) !== 0; const top = (a & 4) !== 0; const bottom = (a & 8) !== 0;
  return { anchorX: left ? 0 : right ? 1 : 0.5, anchorY: top ? 0 : bottom ? 1 : 0.5 };
}

export function buildTransformUpdate(cur: ObsItemState, delta: ObsDelta): { sceneItemTransform: Record<string, number>; next: ObsItemState } {
  const next: ObsItemState = { x: cur.x + (delta.dx ?? 0), y: cur.y + (delta.dy ?? 0), scale: Math.max(0.01, cur.scale * (1 + (delta.ds ?? 0))), width: cur.width, height: cur.height, boundsW: cur.boundsW, boundsH: cur.boundsH, alignment: cur.alignment };
  const sceneItemTransform: Record<string, number> = {};
  if (delta.dx !== undefined) sceneItemTransform.positionX = next.x;
  if (delta.dy !== undefined) sceneItemTransform.positionY = next.y;
  if (delta.ds !== undefined) {
    const { anchorX, anchorY } = computeAnchorFromAlignment(cur.alignment); const factor = 1 + (delta.ds ?? 0);
    if (cur.boundsW && cur.boundsH) {
      const w = cur.boundsW, h = cur.boundsH; const w2 = Math.max(1, Math.round(w * factor)); const h2 = Math.max(1, Math.round(h * factor));
      const nextPosX = cur.x + (0.5 - anchorX) * (w - w2); const nextPosY = cur.y + (0.5 - anchorY) * (h - h2);
      sceneItemTransform.boundsWidth = w2; sceneItemTransform.boundsHeight = h2; sceneItemTransform.positionX = nextPosX; sceneItemTransform.positionY = nextPosY;
      next.boundsW = w2; next.boundsH = h2; next.x = nextPosX; next.y = nextPosY;
    } else {
      sceneItemTransform.scaleX = next.scale; sceneItemTransform.scaleY = next.scale;
      const wBase = cur.width ?? 0, hBase = cur.height ?? 0; if (wBase > 0 || hBase > 0) {
        const w = wBase * cur.scale, h = hBase * cur.scale, w2 = wBase * next.scale, h2 = hBase * next.scale;
        const nextPosX = cur.x + (0.5 - anchorX) * (w - w2), nextPosY = cur.y + (0.5 - anchorY) * (h - h2);
        sceneItemTransform.positionX = nextPosX; sceneItemTransform.positionY = nextPosY; next.x = nextPosX; next.y = nextPosY;
      }
    }
  }
  return { sceneItemTransform, next };
}

/**
 * Calcule un delta scalaire à partir d'un pas de base et d'une valeur CC relative (0..127).
 * - 1..63 → +baseStep (1 tick)
 * - 65..127 → -baseStep (1 tick)
 * - 0 ou 64 → 0
 * - si ctxValue invalide → retourne deltaParam si fourni sinon baseStep
 */
export function resolveStepDelta(deltaParam: number | undefined, ctxValue: unknown, baseStep: number): number {
  const step = Number.isFinite(deltaParam as number) ? Math.abs(Number(deltaParam)) : baseStep;
  const v = typeof ctxValue === "number" ? ctxValue : NaN;
  if (!Number.isFinite(v)) return step;
  if (v === 0 || v === 64) return 0;
  if (v >= 1 && v <= 63) return step;
  if (v >= 65 && v <= 127) return -step;
  return 0;
}


