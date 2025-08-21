import { Input } from "@julusian/midi";
import { logger } from "../../logger";
import { findPortIndexByNameFragment } from "../ports";
import { hasPassthroughAnywhereForApp } from "./core";

export type FeedbackState = {
  inPerApp: Map<string, Input>;
  appToInName: Map<string, string>;
};

export async function ensureFeedbackOpen(app: string, state: FeedbackState): Promise<void> {
  if (state.inPerApp.has(app)) return;
  const needle = state.appToInName.get(app);
  if (!needle) return;
  if (hasPassthroughAnywhereForApp(app)) {
    logger.debug(`MidiAppClient: skip IN for app='${app}' (handled elsewhere).`);
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
        r?.onMidiFromApp?.(app, data, needle);
      } catch {}
    });
    inp.openPort(idx);
    state.inPerApp.set(app, inp);
    logger.info(`MidiAppClient: IN ouvert app='${app}' via '${needle}'.`);
  } catch (err) {
    logger.debug(`MidiAppClient: ouverture IN échouée pour app='${app}':`, err as any);
  }
}


