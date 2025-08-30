import fs from "fs";
import path from "path";
import { parseNumberMaybeHex } from "../midi/utils";

/**
 * Utility to read X‑Touch control mappings from `docs/xtouch-matching.csv`.
 * Provides generic lookups so we never hardcode control IDs (e.g., `fader_master`).
 */

export type XTouchMode = "mcu" | "ctrl";

type CsvRow = { control_id: string; group: string; ctrl_message: string; mcu_message: string };

type MessageSpec = { type: "note" | "cc" | "pb"; ch?: number; d1?: number } | null;

function parseMessageSpec(spec: string): MessageSpec {
	const s = (spec || "").trim();
	if (!s) return null;
	if (s.startsWith("note=")) {
		const n = parseNumberMaybeHex(s.slice(5), NaN);
		return Number.isFinite(n) ? { type: "note", d1: n } : null;
	}
	if (s.startsWith("cc=")) {
		const n = parseNumberMaybeHex(s.slice(3), NaN);
		return Number.isFinite(n) ? { type: "cc", d1: n } : null;
	}
	if (s.startsWith("pb=")) {
		const m = /pb=ch(\d+)/i.exec(s);
		if (m) {
			const ch = parseNumberMaybeHex(m[1], NaN);
			return Number.isFinite(ch) ? { type: "pb", ch } : { type: "pb" };
		}
		return { type: "pb" };
	}
	return null;
}

function readCsvRows(csvPath: string): CsvRow[] {
	const raw = fs.readFileSync(csvPath, "utf8");
	const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
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

export interface XTouchLookup {
	noteToControl: Map<number, string>;
	ccToControl: Map<number, string>;
	pbChannelToControl: Map<number, string>;
	controlIdToPbChannel: Map<string, number>;
	controlIdToKind: Map<string, "note" | "cc" | "pb">;
}

function buildLookup(rows: CsvRow[], mode: XTouchMode): XTouchLookup {
	const noteToControl = new Map<number, string>();
	const ccToControl = new Map<number, string>();
	const pbChannelToControl = new Map<number, string>();
	const controlIdToPbChannel = new Map<string, number>();
	const controlIdToKind = new Map<string, "note" | "cc" | "pb">();
	for (const r of rows) {
		const specTxt = mode === "ctrl" ? r.ctrl_message : r.mcu_message;
		const m = parseMessageSpec(specTxt);
		if (!m) continue;
		if (m.type === "note" && typeof m.d1 === "number") { noteToControl.set(m.d1, r.control_id); controlIdToKind.set(r.control_id, "note"); }
		if (m.type === "cc" && typeof m.d1 === "number") { ccToControl.set(m.d1, r.control_id); controlIdToKind.set(r.control_id, "cc"); }
		if (m.type === "pb" && typeof m.ch === "number") {
			pbChannelToControl.set(m.ch, r.control_id);
			controlIdToPbChannel.set(r.control_id, m.ch);
			controlIdToKind.set(r.control_id, "pb");
		}
	}
	return { noteToControl, ccToControl, pbChannelToControl, controlIdToPbChannel, controlIdToKind };
}

let cachedByMode: Partial<Record<XTouchMode, XTouchLookup>> = {};

function ensureLookup(mode: XTouchMode, customCsvPath?: string): XTouchLookup {
	const key = mode;
	if (cachedByMode[key]) return cachedByMode[key]!;
	const csvPath = customCsvPath || path.join(process.cwd(), "docs", "xtouch-matching.csv");
	const rows = readCsvRows(csvPath);
	const lookup = buildLookup(rows, mode);
	cachedByMode[key] = lookup;
	return lookup;
}

/** Returns the PB channel for a given control ID using the CSV (or null if not a PB control). */
export function getPbChannelForControlId(controlId: string, mode: XTouchMode = "mcu", csvPath?: string): number | null {
	if (!controlId) return null;
	const l = ensureLookup(mode, csvPath);
	return l.controlIdToPbChannel.get(controlId) ?? null;
}

/** Returns input lookups (note/cc/pb) from CSV; used by the input mapper. */
export function getInputLookups(mode: XTouchMode = "mcu", csvPath?: string): XTouchLookup {
	return ensureLookup(mode, csvPath);
}

/** Returns the primary message kind (note/cc/pb) for a given control ID using the CSV. */
export function getMessageTypeForControlId(controlId: string, mode: XTouchMode = "mcu", csvPath?: string): "note" | "cc" | "pb" | null {
	if (!controlId) return null;
	const l = ensureLookup(mode, csvPath);
	return l.controlIdToKind.get(controlId) ?? null;
}


