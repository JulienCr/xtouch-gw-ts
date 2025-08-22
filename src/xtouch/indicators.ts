declare const process: any;
import type { Router } from "../router";
import type { AppConfig, XTouchMode } from "../config";
import type { XTouchDriver } from "./driver";
import * as xtapi from "./api";
import { logger } from "../logger";
import type { Driver, ControlIndicatorConfig } from "../types";

interface CsvRow {
  control_id: string;
  group: string;
  ctrl_message: string;
  mcu_message: string;
}

function parseMessageSpec(spec: string): { type: "note" | "cc" | "pb"; data1?: number } | null {
  const m = /^(note|cc|pb)\s*=\s*([^,\s]+)\s*$/.exec(spec.trim());
  if (!m) return null;
  const type = m[1] as "note" | "cc" | "pb";
  const val = m[2];
  if (type === "pb") return { type };
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return { type, data1: n };
}

async function loadCsv(filePath: string): Promise<CsvRow[]> {
  const fsMod: any = await import("fs");
  const fs = (fsMod.promises ?? fsMod.default?.promises) as { readFile(path: string, encoding: string): Promise<string> };
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  const out: CsvRow[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (i === 0 && line.toLowerCase().startsWith("control_id,")) continue;
    const parts = line.split(/\s*,\s*/);
    if (parts.length < 4) continue;
    out.push({ control_id: parts[0], group: parts[1], ctrl_message: parts[2], mcu_message: parts[3] });
  }
  return out;
}

async function buildLedNoteMap(matchingPath: string, mode: XTouchMode) {
  const rows = await loadCsv(matchingPath);
  const noteByControlId = new Map<string, number>();
  for (const r of rows) {
    const msgSpec = mode === "ctrl" ? r.ctrl_message : r.mcu_message;
    const parsed = parseMessageSpec(msgSpec);
    if (!parsed || parsed.type !== "note" || typeof parsed.data1 !== "number") continue;
    noteByControlId.set(r.control_id, parsed.data1);
  }
  try {
    const dbg = Array.from(noteByControlId.entries()).map(([id, n]) => `${id}->note${n}`).join(", ");
  } catch {}
  return { noteByControlId } as const;
}

export async function attachIndicators(options: {
  router: Router;
  xtouch: XTouchDriver;
  config: AppConfig;
  matchingCsvPath?: string;
}): Promise<() => void> {
  const { router, xtouch, config } = options;
  const mode: XTouchMode = config.xtouch?.mode ?? "mcu";
  const channel = config.paging?.channel ?? 1;
  const matchingPath = options.matchingCsvPath ?? (process.cwd() + "/docs/xtouch-matching.csv");
  let maps: { noteByControlId: Map<string, number> };
  try { maps = await buildLedNoteMap(matchingPath, mode); } catch (err) { logger.warn("Indicators: impossible de charger le CSV de matching:", err as any); return () => {}; }

  // State: controlId → lit?
  const litByControlId = new Map<string, boolean>();

  /**
   * Met à jour les LEDs uniquement pour les contrôles ayant un indicateur explicite.
   *
   * Évite d'écraser les LEDs de navigation (Prev/Next, F1..F8) gérées par `fkeys`.
   */
  const updateLeds = async (): Promise<void> => {
    for (const [controlId, isOn] of litByControlId.entries()) {
      const note = maps.noteByControlId.get(controlId);
      if (typeof note !== "number") continue;
      try { xtapi.sendNoteOn(xtouch, channel, note, isOn ? 127 : 0); } catch {}
    }
  };

  // Generic driver-driven indicators
  const unsubs: Array<() => void> = [];
  const pageControls = ((router.getActivePage() as any)?.controls ?? {}) as Record<string, any>;
  const involvedApps = new Set<string>();
  for (const m of Object.values(pageControls)) { if (m && typeof (m as any).app === "string") { const k = String((m as any).app).trim(); if (k) involvedApps.add(k); } }
  for (const app of involvedApps) {
    const driver = (router as any).getDriver?.(app) as Driver | undefined;
    if (!driver) continue;
    // Subscribe to driver indicator stream if available
    if (typeof driver.subscribeIndicators === "function") {
      const u = driver.subscribeIndicators((signal: string, value: unknown) => {
        try {
          const controls = ((router.getActivePage() as any)?.controls ?? {}) as Record<string, any>;
          for (const [controlId, mapping] of Object.entries(controls)) {
            const ind: ControlIndicatorConfig | undefined = (mapping as any)?.indicator;
            if (!ind) continue;
            if (ind.signal !== signal) continue;
            let on = false;
            if (ind.truthy) {
              on = !!value;
            } else if (ind.in && Array.isArray(ind.in)) {
              on = ind.in.some((v) => {
                if (typeof v === "string" && typeof value === "string") return v.trim() === value.trim();
                return Object.is(v, value);
              });
            } else if (Object.prototype.hasOwnProperty.call(ind, "equals")) {
              if (typeof ind.equals === "string" && typeof value === "string") on = ind.equals.trim() === value.trim();
              else on = Object.is(ind.equals, value);
            }
            litByControlId.set(controlId, on);
          }
          updateLeds().catch(() => {});
        } catch {}
      });
      if (typeof u === "function") unsubs.push(u);
      
      // Force a sync once subscribed (duck-typed)
      const anyDriver = driver as any;
      if (typeof anyDriver.refreshIndicatorSignals === "function") {
        anyDriver.refreshIndicatorSignals().catch(() => {});
      }
    }
  }

  // Initial LED state
  try { await updateLeds(); } catch {}

  return () => {
    for (const u of unsubs) { try { u(); } catch {} }
  };
}

export async function refreshIndicators(options: {
  router: Router;
  xtouch: XTouchDriver;
  config: AppConfig;
  matchingCsvPath?: string;
}): Promise<void> {
  const { router } = options;
  // Ask involved drivers to re-emit their indicator signals; the attachIndicators
  // subscription will consume these and update LEDs accordingly.
  const controls = ((router.getActivePage() as any)?.controls ?? {}) as Record<string, any>;
  const involvedApps = new Set<string>();
  for (const m of Object.values(controls)) { if (m && typeof (m as any).app === "string") { const k = String((m as any).app).trim(); if (k) involvedApps.add(k); } }
  for (const app of involvedApps) {
    try {
      const driver = (router as any).getDriver?.(app) as Driver | undefined;
      const anyDriver = driver as any;
      if (anyDriver && typeof anyDriver.refreshIndicatorSignals === "function") {
        await anyDriver.refreshIndicatorSignals();
      }
    } catch {}
  }
}


