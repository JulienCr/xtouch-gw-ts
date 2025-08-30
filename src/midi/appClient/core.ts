import type { XTouchDriver } from "../../xtouch/driver";
import { resolveAppKey } from "../../shared/appKey";
export { clamp } from "../../shared/num";

/** Marque l'envoi côté app et reboucle vers Router pour anti‑echo/latence/state. */
export function markAppOutgoingAndForward(app: string, raw: number[], portId: string): void {
  try {
    const g = (global as unknown as { __router__?: any }).__router__;
    g?.markAppShadowForOutgoing?.(app, raw, portId);
    g?.onMidiFromApp?.(app, raw, portId);
  } catch {}
}

// clamp désormais centralisé dans src/shared/num.ts

export function getGlobalXTouch(): XTouchDriver | null {
  try {
    const g = (global as unknown as { __xtouch__?: XTouchDriver });
    return g?.__xtouch__ ?? null;
  } catch {
    return null;
  }
}

export function hasPassthroughForApp(app: string): boolean {
  try {
    const g = (global as unknown as { __router__?: { getActivePage: () => any } });
    const page = g?.__router__?.getActivePage?.();
    if (!page) return false;
    const items = (page as any).passthroughs ?? ((page as any).passthrough ? [(page as any).passthrough] : []);
    for (const it of (items as any[])) {
      const appKey = resolveAppKey(String(it?.to_port || ""), String(it?.from_port || ""));
      if (appKey === app) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function hasPassthroughAnywhereForApp(app: string): boolean {
  try {
    const g = (global as unknown as { __router__?: { getPagesMerged: () => any[] } });
    const pages = g?.__router__?.getPagesMerged?.();
    if (!Array.isArray(pages)) return false;
    for (const p of pages) {
      const items = (p as any).passthroughs ?? ((p as any).passthrough ? [(p as any).passthrough] : []);
      for (const it of (items as any[])) {
        const appKey = resolveAppKey(String(it?.to_port || ""), String(it?.from_port || ""));
        if (appKey === app) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Retourne true si une passerelle/bridge global(e) possède déjà l'IN pour cette app. */
export function hasBridgeForApp(app: string): boolean {
  try {
    const g = (global as unknown as { __appBridges__?: Set<string> });
    return g?.__appBridges__?.has(app) ?? false;
  } catch {
    return false;
  }
}


