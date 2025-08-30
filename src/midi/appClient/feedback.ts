import { Input } from "@julusian/midi";
import { logger } from "../../logger";
import { findPortIndexByNameFragment } from "../ports";
import type { MidiClientHooks } from "./hooks";

export type FeedbackState = {
  inPerApp: Map<string, Input>;
  appToInName: Map<string, string>;
};

export async function ensureFeedbackOpen(app: string, state: FeedbackState, hooks?: MidiClientHooks): Promise<void> {
  const appKey = String(app).trim();
  if (state.inPerApp.has(appKey)) return;
  const needle = state.appToInName.get(appKey);
  if (!needle) return;
  // Ask orchestrator whether we should open IN for this app.
  if (hooks?.shouldOpenFeedback?.(appKey) === false) return;
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
      try { hooks?.onFeedback?.(appKey, data, needle); } catch {}
    });
    inp.openPort(idx);
    state.inPerApp.set(appKey, inp);
    logger.info(`MidiAppClient: IN ouvert app='${appKey}' via '${needle}'.`);
  } catch (err) {
    logger.debug(`MidiAppClient: ouverture IN échouée pour app='${appKey}':`, err as any);
  }
}


