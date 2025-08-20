import type { Router } from "../router";
import type { XTouchDriver } from "./driver";
import { promises as fs } from "fs";
import path from "path";
declare const process: any;
import { logger } from "../logger";

type CsvRow = { control_id: string; group: string; ctrl_message: string; mcu_message: string };

function parseMessageSpec(spec: string): { type: "note" | "cc" | "pb"; ch?: number; d1?: number } | null {
  // Accept patterns: note=XX, cc=YY, pb=chN
  const s = spec.trim();
  if (s.startsWith("note=")) {
    const n = Number(s.slice(5));
    return Number.isFinite(n) ? { type: "note", d1: n } : null;
  }
  if (s.startsWith("cc=")) {
    const n = Number(s.slice(3));
    return Number.isFinite(n) ? { type: "cc", d1: n } : null;
  }
  if (s.startsWith("pb=")) {
    return { type: "pb" };
  }
  return null;
}

async function loadCsv(p: string): Promise<CsvRow[]> {
  const raw = await fs.readFile(p, "utf8");
  const lines = raw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  const out: CsvRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.toLowerCase().startsWith("control_id,")) continue;
    const parts = line.split(/\s*,\s*/);
    if (parts.length < 4) continue;
    out.push({ control_id: parts[0], group: parts[1], ctrl_message: parts[2], mcu_message: parts[3] });
  }
  return out;
}

export interface InputMapperOptions {
  router: Router;
  xtouch: XTouchDriver;
  mode: "mcu" | "ctrl";
  channel?: number; // default 1
  matchingCsvPath?: string; // default docs/xtouch-matching.csv
}

/**
 * Mappe génériquement les entrées X‑Touch (Note/CC/PB) vers des `control_id` logiques via le CSV,
 * puis les transmet à `router.handleControl(control_id, valueOptionnel)`.
 */
export async function attachInputMapper(opts: InputMapperOptions): Promise<() => void> {
  const { router, xtouch, mode } = opts;
  const channel = opts.channel ?? 1;
  const csvPath = opts.matchingCsvPath ?? path.join(process.cwd(), "docs", "xtouch-matching.csv");
  const rows = await loadCsv(csvPath);
  // Build reverse maps per type (note/cc/pb) for fast lookup on CH1
  const noteToControl = new Map<number, string>();
  const ccToControl = new Map<number, string>();
  const hasAnyPbControl = new Set<string>();
  for (const r of rows) {
    const spec = mode === "ctrl" ? r.ctrl_message : r.mcu_message;
    const m = parseMessageSpec(spec);
    if (!m) continue;
    if (m.type === "note" && typeof m.d1 === "number") noteToControl.set(m.d1, r.control_id);
    if (m.type === "cc" && typeof m.d1 === "number") ccToControl.set(m.d1, r.control_id);
    if (m.type === "pb") hasAnyPbControl.add(r.control_id);
  }

  const unsub = xtouch.subscribe((_delta, data) => {
    try {
      const status = data[0] ?? 0;
      const typeNibble = (status & 0xf0) >> 4;
      const ch1 = (status & 0x0f) + 1;
      if (ch1 !== (channel | 0)) return;
      if (typeNibble === 0x9) {
        // Note On (treat vel 0 as off; only handle press)
        const note = data[1] ?? 0;
        const vel = data[2] ?? 0;
        if (vel <= 0) return;
        const id = noteToControl.get(note);
        if (id) router.handleControl(id).catch(() => {});
        return;
      }
      if (typeNibble === 0xB) {
        // Control Change 0..127, value 0..127
        const cc = data[1] ?? 0;
        const v = data[2] ?? 0;
        const id = ccToControl.get(cc);
        if (id) router.handleControl(id, v).catch(() => {});
        return;
      }
      if (typeNibble === 0xE) {
        // Pitch Bend 14 bits (faders en mode MCU)
        // Acheminer vers les contrôles PB si configurés (ex: fader1)
        const lsb = data[1] ?? 0;
        const msb = data[2] ?? 0;
        const value14 = ((msb & 0x7f) << 7) | (lsb & 0x7f);
        // Dans le CSV, les faders PB sont déclarés avec pb=chN → control_id par strip (ex: fader1..8)
        // Ici, on ne connaît pas l'association channel→id sans logique dédiée.
        // Stratégie: on émet des events vers des ids connus s'ils existent conventionnellement.
        // Convention: "fader1".."fader9".
        const ch1 = (status & 0x0f) + 1;
        const id = ch1 >= 1 && ch1 <= 8 ? `fader${ch1}` : (ch1 === 9 ? "fader_master" : null);
        if (id && hasAnyPbControl.has(id)) {
          // MODIF: n'émettre PB→handleControl que si la page active a un mapping pour cet id
          try {
            const page = (router as any).getActivePage?.();
            if (page && page.controls && Object.prototype.hasOwnProperty.call(page.controls, id)) {
              router.handleControl(id, value14).catch(() => {});
            }
          } catch {}
        }
        return;
      }
    } catch (err) {
      logger.debug("InputMapper error:", err as any);
    }
  });

  logger.info("InputMapper: attached (mode=%s, ch=%d)", mode, channel);
  return () => { try { unsub(); } catch {} };
}


