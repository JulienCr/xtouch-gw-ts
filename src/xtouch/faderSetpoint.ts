import type { XTouchDriver } from "./driver";

/**
 * Gestion centralisée des setpoints moteurs de faders (Pitch Bend 14 bits) avec anti-rebond.
 * Évite que le fader « revienne » après un mouvement utilisateur, en fixant la dernière valeur
 * après une courte inactivité.
 */
const timersByChannel = new Map<number, NodeJS.Timeout>();
const lastValue14ByChannel = new Map<number, number>();

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
  const v = Math.max(0, Math.min(16383, value14 | 0));
  lastValue14ByChannel.set(ch, v);
  const prev = timersByChannel.get(ch);
  if (prev) {
    try { clearTimeout(prev); } catch {}
  }
  const t = setTimeout(() => {
    const last = lastValue14ByChannel.get(ch);
    if (last != null) {
      try { xtouch.setFader14(ch, last); } catch {}
    }
    timersByChannel.delete(ch);
  }, delayMs);
  timersByChannel.set(ch, t);
}


