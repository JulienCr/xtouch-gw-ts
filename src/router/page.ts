import type { AppKey, MidiStateEntry, MidiStatus } from "../state";
import type { PageConfig } from "../config";
import { getPbChannelForControlId, getMessageTypeForControlId, getInputLookups } from "../xtouch/matching";
import { getPagePassthroughItems } from "../config/passthrough";
import { resolveAppKey } from "../shared/appKey";
import type { ControlMapping } from "../types";
import { parseNumberMaybeHex } from "../midi/utils";

export function getAppsForPage(page: PageConfig): AppKey[] {
	const items = getPagePassthroughItems(page);
	const viaPassthrough: AppKey[] = Array.isArray(items)
		? Array.from(new Set(items.map((it: any) => resolveAppKey(it?.to_port, it?.from_port) as AppKey)))
		: [];
	const set = new Set<AppKey>(viaPassthrough);
	// MODIF: inclure aussi les apps référencées par controls.* (mapping/app), même s'il existe des passthroughs
	const controls = (page.controls as Record<string, unknown>) || {};
	for (const [, raw] of Object.entries(controls)) {
		const m = raw as unknown as { app?: string };
		if (m && typeof m.app === "string") {
			const key = (m.app || "").trim();
			if (key) set.add(key as AppKey);
		}
	}
	const out = Array.from(set.values());
	// Fallback historique: si aucune app explicite, considérer 'voicemeeter' par défaut
	if (out.length === 0) return ["voicemeeter" as AppKey];
	return out;
}

export function getChannelsForApp(page: PageConfig, app: AppKey): number[] {
	const items = getPagePassthroughItems(page);
	const relevant = (Array.isArray(items) ? items : [])
		.filter((it: any) => (resolveAppKey(it?.to_port, it?.from_port) as AppKey) === app);
	const channels = new Set<number>();
	for (const it of relevant) {
		const chs: number[] | undefined = it?.filter?.channels;
		if (Array.isArray(chs)) for (const c of chs) if (typeof c === "number") channels.add(c);
		const ccMap = it?.transform?.pb_to_cc?.cc_by_channel;
		if (ccMap && typeof ccMap === "object") {
			for (const k of Object.keys(ccMap)) {
				const n = Number(k);
				if (Number.isFinite(n)) channels.add(n);
			}
		}
		if (it?.transform?.pb_to_cc?.base_cc != null) {
			for (let i = 1; i <= 9; i++) channels.add(i);
		}
	}
	if (channels.size === 0) {
		for (let i = 1; i <= 9; i++) channels.add(i);
	}
	return Array.from(channels.values()).sort((a, b) => a - b);
}

export function resolvePbToCcMappingForApp(page: PageConfig, app: AppKey): { map: Map<number, number>; channelForCc: Map<number, number> } | null {
	const items = getPagePassthroughItems(page);
	const cfg = (Array.isArray(items) ? items : [])
		.map((it: any) => ({ app: resolveAppKey(it?.to_port, it?.from_port) as AppKey, transform: it?.transform }))
		.find((x: any) => x.app === app);
	const pb2cc = cfg?.transform?.pb_to_cc;
	const out = new Map<number, number>();
	const reverse = new Map<number, number>();
	if (pb2cc) {
		const baseRaw = pb2cc.base_cc;
		const base = baseRaw != null ? parseNumberMaybeHex(baseRaw as any, NaN) : undefined;
		for (let ch = 1; ch <= 9; ch++) {
			let cc = pb2cc.cc_by_channel?.[ch];
			if (cc == null && base != null) {
				cc = base + (ch - 1);
			}
			if (cc != null) {
				const ccNum = parseNumberMaybeHex(cc as any, NaN);
				if (Number.isFinite(ccNum)) { out.set(ch, ccNum); reverse.set(ccNum, ch); }
			}
		}
	}

	// MODIF: si aucune transform pb_to_cc n'est définie, construire une table depuis les controls.*.midi
	if (out.size === 0 && page?.controls) {
		const entries = Object.entries((page.controls as Record<string, unknown>) || {}) as Array<[string, ControlMapping]>;
		for (const [controlId, mapping] of entries) {
			if (!mapping || (mapping.app || "").trim() !== (app as string) || !mapping.midi) continue;
			const spec = mapping.midi;
			if (spec.type !== "cc") continue;
			// Déterminer le canal PB associé au control_id via le CSV (générique)
			let ch: number | null = getPbChannelForControlId(controlId, "mcu") ?? null;
			if (ch == null) continue;
				const cc = parseNumberMaybeHex(spec.cc as any, NaN);
				if (Number.isFinite(cc)) {
					out.set(ch, cc);
					reverse.set(cc, ch);
				}
			}
		}

	return out.size > 0 ? { map: out, channelForCc: reverse } : null;
}

export function transformAppToXTouch(page: PageConfig, app: AppKey, entry: MidiStateEntry): MidiStateEntry | null {
	const outs = transformAppToXTouchAll(page, app, entry);
	return outs.length > 0 ? outs[0] : null;
}


/**
 * Transforme un évènement app → une ou plusieurs sorties X‑Touch.
 *
 * - note: relai si autorisé, sinon aucune sortie
 * - pb/sysex: relai direct
 * - cc: vers PB si mappé; sinon, fan‑out en Notes pour tous les contrôles partageant (app, cc)
 */
export function transformAppToXTouchAll(page: PageConfig, app: AppKey, entry: MidiStateEntry): MidiStateEntry[] {
	const status = entry.addr.status as MidiStatus;
	if (status === "note") {
		const items = getPagePassthroughItems(page);
		const relevant = (Array.isArray(items) ? items : [])
			.filter((it: any) => (resolveAppKey(it?.to_port, it?.from_port) as AppKey) === app);
		let allow = false;
		for (const it of relevant) {
			const types: string[] | undefined = it?.filter?.types;
			if (Array.isArray(types) && (types.includes("noteOn") || types.includes("noteOff"))) { allow = true; break; }
		}
		if (!allow) {
			try {
				const note = entry.addr.data1 ?? -1;
				if (typeof note === "number" && note >= 0) {
					const lookup = getInputLookups("mcu");
					const controlId = lookup.noteToControl.get(note) || null;
					if (controlId) {
						const m = (page.controls as Record<string, ControlMapping | undefined>)[controlId];
						if (m && m.app === app && m.midi) {
							const kind = getMessageTypeForControlId(controlId, "mcu");
							if (kind === "note") allow = true;
						}
					}
				}
			} catch {}
		}
		return allow ? [entry] : [];
	}
	if (status === "pb" || status === "sysex") {
		return [entry];
	}
	if (status === "cc") {
		const m = resolvePbToCcMappingForApp(page, app);
		const map = m?.map;
		const ccNum = entry.addr.data1 ?? -1;
		if (map && map.size > 0) {
			let faderChannel: number | null = null;
			for (const [ch, cc] of map.entries()) {
				if (cc === ccNum) { faderChannel = ch; break; }
			}
			if (faderChannel != null) {
				const v7 = typeof entry.value === "number" ? entry.value : 0;
				const v7c = Math.max(0, Math.min(127, Math.floor(v7)));
				const v14 = (v7c << 7) | v7c;
				return [{
					addr: { portId: app, status: "pb", channel: faderChannel, data1: 0 },
					value: v14,
					ts: entry.ts,
					origin: "app",
					known: true,
					stale: entry.stale,
				} as MidiStateEntry];
			}
		}

		// Fan‑out LED: tous les contrôles ayant app+cc identiques
		try {
			const controls = (page.controls as Record<string, ControlMapping | undefined>) || {};
			const lookup = getInputLookups("mcu");
			const matches: string[] = [];
			for (const [cid, mapping] of Object.entries(controls)) {
				if (!mapping || (mapping.app || "").trim() !== (app as string)) continue;
				const spec = mapping.midi;
				if (!spec || spec.type !== "cc") continue;
				const cc = Number(spec.cc);
				if (Number.isFinite(cc) && cc === ccNum) { matches.push(cid); }
			}
			if (matches.length > 0) {
				const v = typeof entry.value === "number" ? entry.value : 0;
				const vel = v > 0 ? 127 : 0;
				const outs: MidiStateEntry[] = [];
				for (const cid of matches) {
					const kind = getMessageTypeForControlId(cid, "mcu");
					if (kind !== "note") continue;
					let note: number | null = null;
					for (const [n, id] of lookup.noteToControl.entries()) { if (id === cid) { note = n; break; } }
					if (typeof note === "number") {
						outs.push({
							addr: { portId: app, status: "note", channel: 1, data1: note },
							value: vel,
							ts: entry.ts,
							origin: "app",
							known: true,
							stale: entry.stale,
						} as MidiStateEntry);
					}
				}
				if (outs.length > 0) return outs;
			}
		} catch {}
		return [];
	}
	return [];
}


