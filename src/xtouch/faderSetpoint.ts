import type { XTouchDriver } from "./driver";
import { logger } from "../logger";

/**
 * Contrôleur state‑based des setpoints moteurs (Pitch Bend 14b).
 * - Source de vérité: desired14 par canal
 * - Anti‑obsolescence: planifie un applyLatest(epoch) qui relit desired14
 * - Extrêmes (0/16383): application immédiate (delay=0)
 */
type ChannelState = {
  desired14: number;
  lastTx14: number;
  lastRx14: number;
  epoch: number;
  timer: NodeJS.Timeout | null;
};

const stateByChannel = new Map<number, ChannelState>();

function getChannelState(ch: number): ChannelState {
  let st = stateByChannel.get(ch);
  if (!st) {
    st = { desired14: 0, lastTx14: -1, lastRx14: -1, epoch: 0, timer: null };
    stateByChannel.set(ch, st);
  }
  return st;
}

function clearTimerIfAny(st: ChannelState): void {
  if (st.timer) {
    try { clearTimeout(st.timer); } catch {}
    st.timer = null;
  }
}

function scheduleApply(xtouch: XTouchDriver, ch: number, epochAtPlan: number, delayMs: number): void {
  const st = getChannelState(ch);
  clearTimerIfAny(st);
  const t = setTimeout(() => applyLatest(xtouch, ch, epochAtPlan), Math.max(0, delayMs | 0));
  st.timer = t;
}

function applyLatest(xtouch: XTouchDriver, ch: number, epochAtPlan: number): void {
  const st = getChannelState(ch);
  // Si une mise à jour plus récente est arrivée, laisser son propre timer faire le travail
  if (epochAtPlan !== st.epoch) return;
  const v = Math.max(0, Math.min(16383, st.desired14 | 0));
  
  try { logger.trace(`FaderSetpoint apply ch=${ch} v=${v}`); } catch {}
  
  try { xtouch.setFader14(ch, v); st.lastTx14 = v; } catch (err) {
    // En cas d'échec/IO/suppression (ex: squelch/touch côté driver), re-tenter plus tard
    try { logger.trace(`FaderSetpoint requeue ch=${ch} v=${v}`); } catch {}
    scheduleApply(xtouch, ch, st.epoch, 120);
  }
}

/**
 * Programme (debounce) la mise à jour du moteur du fader après une courte inactivité.
 * @param xtouch Driver X‑Touch
 * @param channel1 Canal MIDI (1..16)
 * @param value14 Valeur Pitch Bend 14 bits (0..16383)
 * @param delayMs Délai d'inactivité avant application (défaut 90ms)
 */
export function scheduleFaderSetpoint(
  xtouch: XTouchDriver,
  channel1: number,
  value14: number,
  delayMs: number = 90
): void {
  const ch = Math.max(1, Math.min(16, channel1 | 0));
  // Clamp strict sans zone morte aux extrémités
  const clamped = Math.max(0, Math.min(16383, value14 | 0));
  const st = getChannelState(ch);
  st.desired14 = clamped;
  st.epoch++;
  const isExtreme = clamped === 0 || clamped === 16383;
  const effDelay = isExtreme ? 0 : delayMs;
  try { logger.trace(`FaderSetpoint schedule ch=${ch} raw=${value14 | 0} clamped=${clamped} delay=${effDelay}`); } catch {}
  scheduleApply(xtouch, ch, st.epoch, effDelay);
}


