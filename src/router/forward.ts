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

  const maybeForward = transformAppToXTouch(page, app, entry);
  if (!maybeForward) return;

  const targetKey = deps.addrKeyForXTouch(maybeForward.addr);
  const lastLocal = deps.lastUserActionTs.get(targetKey) ?? 0;
  const grace = (maybeForward.addr.status === "pb" ? 300 : (maybeForward.addr.status === "cc" ? 50 : 0));
  if (Date.now() - lastLocal < grace) {
    return;
  }
  deps.emitIfNotDuplicate(maybeForward);
}


