import { promises as fs } from "fs";
import path from "path";
import type { Router } from "../router";
import type { AppConfig, XTouchMode } from "../config";
import type { XTouchDriver } from "./driver";
import type { ObsDriver } from "../drivers/obs";
import * as xtapi from "./api";
import { logger } from "../logger";

type AssignKey = "track" | "send" | "pan" | "plugin" | "eq" | "instrument";

interface CsvRow {
  control_id: string;
  group: string;
  ctrl_message: string;
  mcu_message: string;
}

function parseMessageSpec(spec: string): { type: "note" | "cc" | "pb"; data1?: number } | null {
  // examples: "note=40", "cc=87", "pb=ch1"
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
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
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

function controlIdToAssignKey(controlId: string): AssignKey | null {
  switch (controlId) {
    case "assign_track": return "track";
    case "assign_send": return "send";
    case "assign_pan": return "pan";
    case "assign_plugin": return "plugin";
    case "assign_eq": return "eq";
    case "assign_instr": return "instrument";
    default: return null;
  }
}

async function buildAssignMaps(matchingPath: string, mode: XTouchMode) {
  const rows = await loadCsv(matchingPath);
  const noteByAssign = new Map<AssignKey, number>();
  for (const r of rows) {
    if (r.group !== "assign") continue;
    const key = controlIdToAssignKey(r.control_id);
    if (!key) continue;
    const msgSpec = mode === "ctrl" ? r.ctrl_message : r.mcu_message;
    const parsed = parseMessageSpec(msgSpec);
    if (!parsed || parsed.type !== "note" || typeof parsed.data1 !== "number") continue;
    noteByAssign.set(key, parsed.data1);
  }
  const assignByNote = new Map<number, AssignKey>();
  for (const [k, n] of noteByAssign.entries()) assignByNote.set(n, k);
  return { noteByAssign, assignByNote } as const;
}

function getScenesForActivePage(router: Router, config: AppConfig): Partial<Record<AssignKey, string>> {
  const page = router.getActivePage?.();
  const pageScenes = (page as any)?.assign_scenes as Partial<Record<AssignKey, string>> | undefined;
  const rootScenes = (config.assign_scenes ?? {}) as Partial<Record<AssignKey, string>>;
  return { ...rootScenes, ...(pageScenes ?? {}) };
}

export async function attachAssignButtons(options: {
  router: Router;
  xtouch: XTouchDriver;
  obs: ObsDriver;
  config: AppConfig;
  matchingCsvPath?: string;
}): Promise<() => void> {
  const { router, xtouch, obs, config } = options;
  const mode: XTouchMode = config.xtouch?.mode ?? "mcu";
  const channel = config.paging?.channel ?? 1;
  const matchingPath = options.matchingCsvPath ?? path.join(process.cwd(), "docs", "xtouch-matching.csv");
  let maps: { noteByAssign: Map<AssignKey, number>; assignByNote: Map<number, AssignKey> };
  try { maps = await buildAssignMaps(matchingPath, mode); } catch (err) { logger.warn("AssignButtons: impossible de charger le CSV de matching:", err as any); return () => {}; }

  const updateLeds = async (currentScene: string): Promise<void> => {
    const scenes = getScenesForActivePage(router, config);
    for (const [k, note] of maps.noteByAssign.entries()) {
      const target = scenes[k];
      const on = target && currentScene === target;
      try { xtapi.sendNoteOn(xtouch, channel, note, on ? 127 : 0); } catch {}
    }
  };

  // Initial LED state
  try { const cur = await obs.getCurrentProgramScene(); await updateLeds(cur); } catch {}

  // Subscribe to OBS scene changes
  const unsubObs = obs.onSceneChanged((scene) => { updateLeds(scene).catch(() => {}); });

  // Handle button presses
  const unsubX = xtouch.subscribe((_delta, data) => {
    const status = data[0] ?? 0;
    if ((status & 0xf0) !== 0x90) return; // Note On only
    const ch1 = (status & 0x0f) + 1;
    if (ch1 !== (channel | 0)) return;
    const note = data[1] ?? -1;
    const vel = data[2] ?? 0;
    if (vel <= 0) return;
    const k = maps.assignByNote.get(note);
    if (!k) return;
    const scenes = getScenesForActivePage(router, config);
    const scene = scenes[k];
    if (!scene) return;
    obs.execute("setScene", [scene], { controlId: `assign_${k}` }).catch(() => {});
  });

  logger.info("AssignButtons: attach OK (mode=%s, channel=%d)", mode, channel);

  return () => {
    try { unsubX(); } catch {}
    try { unsubObs(); } catch {}
  };
}

export async function refreshAssignLeds(options: {
  router: Router;
  xtouch: XTouchDriver;
  obs: ObsDriver;
  config: AppConfig;
  matchingCsvPath?: string;
}): Promise<void> {
  const { router, xtouch, obs, config } = options;
  const mode: XTouchMode = config.xtouch?.mode ?? "mcu";
  const channel = config.paging?.channel ?? 1;
  const matchingPath = options.matchingCsvPath ?? path.join(process.cwd(), "docs", "xtouch-matching.csv");
  const { noteByAssign } = await buildAssignMaps(matchingPath, mode);
  const scenes = getScenesForActivePage(router, config);
  const cur = await obs.getCurrentProgramScene();
  for (const [k, note] of noteByAssign.entries()) {
    const on = !!(scenes[k] && scenes[k] === cur);
    try { xtapi.sendNoteOn(xtouch, channel, note, on ? 127 : 0); } catch {}
  }
}


