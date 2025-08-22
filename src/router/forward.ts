import type { AppKey, MidiStateEntry } from "../state";
import type { PageConfig } from "../config";
import { getAppsForPage, transformAppToXTouch } from "./page";
import { midiValueEquals, getAntiLoopMs } from "./antiEcho";

export interface ForwardDeps {
  getActivePage: () => PageConfig | undefined;
  hasXTouch: () => boolean;
  getAppShadow: (app: string) => Map<string, { value: MidiStateEntry["value"]; ts: number }>;
  addrKeyForApp: (addr: MidiStateEntry["addr"]) => string;
  addrKeyForXTouch: (addr: MidiStateEntry["addr"]) => string;
  ensureLatencyMeters: (app: string) => Record<MidiStateEntry["addr"]["status"], { record: (ms: number) => void }>;
  antiLoopWindows: Record<MidiStateEntry["addr"]["status"], number>;
  lastUserActionTs: Map<string, number>;
  emitIfNotDuplicate: (entry: MidiStateEntry) => void;
  /** Optionnel: permet de programmer un setpoint moteur de fader indépendamment de l'émission. */
  scheduleSetpoint?: (channel1to16: number, value14: number) => void;
}

/**
 * Pipeline de forward d'un feedback app → X‑Touch (anti-echo, LWW, transform, emit).
 */
export function forwardFromApp(
  deps: ForwardDeps,
  appKey: string,
  entry: MidiStateEntry
): void {
  if (!deps.hasXTouch()) return;
  const page = deps.getActivePage();
  if (!page) return;

  const app = appKey as AppKey;
  const appsInPage = getAppsForPage(page);
  // MODIF: toujours autoriser l'app si un passthrough actif est présent sur la page courante
  if (!appsInPage.includes(app)) return;

  // 1) Construire immédiatement la cible X‑Touch afin de programmer le setpoint même si l'émission est bloquée
  const maybeForward = transformAppToXTouch(page, app, entry);
  if (!maybeForward) return;

  // 2) Toujours programmer le setpoint moteur pour les PB, indépendamment de l'anti‑echo émission
  if (maybeForward.addr.status === "pb") {
    try {
      const ch = Math.max(1, Math.min(16, (maybeForward.addr.channel ?? 1) | 0));
      const v14 = typeof maybeForward.value === "number" && Number.isFinite(maybeForward.value)
        ? (maybeForward.value as number) | 0
        : 0;
      deps.scheduleSetpoint?.(ch, v14);
    } catch {}
  }

  const k = deps.addrKeyForApp(entry.addr);
  const prev = deps.getAppShadow(app).get(k);
  const now = Date.now();
  if (prev) {
    const rtt = now - prev.ts;
    try { deps.ensureLatencyMeters(app)[entry.addr.status].record(rtt); } catch {}
    const win = getAntiLoopMs(deps.antiLoopWindows as any, entry.addr.status);
    if (midiValueEquals(prev.value, entry.value) && rtt < win) {
      return;
    }
  }

  const targetKey = deps.addrKeyForXTouch(maybeForward.addr);
  const lastLocal = deps.lastUserActionTs.get(targetKey) ?? 0;
  const grace = (maybeForward.addr.status === "pb" ? 300 : (maybeForward.addr.status === "cc" ? 50 : 0));
  if (Date.now() - lastLocal < grace) {
    return;
  }
  deps.emitIfNotDuplicate(maybeForward);
}


