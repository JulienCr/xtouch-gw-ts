import { Input } from "@julusian/midi";
import { logger } from "../../logger";
import { findPortIndexByNameFragment } from "../ports";
import { hasPassthroughAnywhereForApp, hasBridgeForApp } from "./core";

export type FeedbackState = {
  inPerApp: Map<string, Input>;
  appToInName: Map<string, string>;
};

export async function ensureFeedbackOpen(app: string, state: FeedbackState): Promise<void> {
  const appKey = String(app).trim();
  if (state.inPerApp.has(appKey)) return;
  const needle = state.appToInName.get(appKey);
  if (!needle) return;
  // Skip opening if ANY page has a passthrough for this app, or a global bridge owns it.
  // Background listeners (for other pages) or the owning bridge will handle IN to avoid double-open.
  if (hasPassthroughAnywhereForApp(appKey) || hasBridgeForApp(appKey)) {
    //logger.trace(`MidiAppClient: skip IN for app='${appKey}' (handled elsewhere).`);
    return;
  }
  try {
    const inp = new Input();
    const idx = findPortIndexByNameFragment(inp, needle);
    if (idx == null) {
      inp.closePort?.();
      logger.debug(`MidiAppClient: port IN introuvable '${needle}' (optional)`);
      return;
    }
    inp.ignoreTypes(false, false, false);
    inp.on("message", (_delta, data) => {
      try {
        const r = (global as unknown as { __router__?: { onMidiFromApp: (appKey: string, raw: number[], portId: string) => void } }).__router__;
        r?.onMidiFromApp?.(appKey, data, needle);
      } catch {}
    });
    inp.openPort(idx);
    state.inPerApp.set(appKey, inp);
    logger.info(`MidiAppClient: IN ouvert app='${appKey}' via '${needle}'.`);
  } catch (err) {
    logger.debug(`MidiAppClient: ouverture IN échouée pour app='${appKey}':`, err as any);
  }
}


