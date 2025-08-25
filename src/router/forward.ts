import type { AppKey, MidiStateEntry } from "../state";
import type { PageConfig } from "../config";
import { getAppsForPage, transformAppToXTouchAll } from "./page";
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

  // 1) Construire immédiatement les cibles X‑Touch (fan‑out possible)
  const outs = transformAppToXTouchAll(page, app, entry);
  if (!outs || outs.length === 0) return;

  // 2) Toujours programmer les setpoints moteurs pour les PB, indépendamment de l'anti‑echo émission
  for (const o of outs) {
    if (o.addr.status === "pb") {
      try {
        const ch = Math.max(1, Math.min(16, (o.addr.channel ?? 1) | 0));
        const v14 = typeof o.value === "number" && Number.isFinite(o.value)
          ? (o.value as number) | 0
          : 0;
        deps.scheduleSetpoint?.(ch, v14);
      } catch {}
    }
  }

  const k = deps.addrKeyForApp(entry.addr);
  const prev = deps.getAppShadow(app).get(k);
  const now = (typeof entry.ts === "number" && Number.isFinite(entry.ts)) ? (entry.ts as number) : Date.now();
  if (prev) {
    const rtt = now - prev.ts;
    try { deps.ensureLatencyMeters(app)[entry.addr.status].record(rtt); } catch {}
    const win = getAntiLoopMs(deps.antiLoopWindows as any, entry.addr.status);
    // Anti-echo suppression policy:
    // - If any output matches the input type, suppress within window
    // - Additionally, treat CC→PB (fader mapping) as suppressible using the CC window
    // - Do not suppress CC→Note fan-out (LEDs)
    const anyMatchesInput = outs.some((o) => o.addr.status === entry.addr.status);
    const isCcToPb = entry.addr.status === "cc" && outs.some((o) => o.addr.status === "pb");
    if ((anyMatchesInput || isCcToPb) && midiValueEquals(prev.value, entry.value) && rtt < win) {
      return;
    }
  }

  for (const o of outs) {
    const targetKey = deps.addrKeyForXTouch(o.addr);
    const lastLocal = deps.lastUserActionTs.get(targetKey) ?? 0;
    const grace = (o.addr.status === "pb" ? 300 : (o.addr.status === "cc" ? 50 : 0));
    if (Date.now() - lastLocal < grace) {
      continue;
    }
    deps.emitIfNotDuplicate(o);
  }
}


