import type { AppKey, MidiStateEntry, MidiStatus } from "../state";
import type { PageConfig } from "../config";
import { getPagePassthroughItems } from "../config/passthrough";
import { resolveAppKey } from "../shared/appKey";

export function getAppsForPage(page: PageConfig): AppKey[] {
	const items = getPagePassthroughItems(page);
	const appKeys: AppKey[] = Array.isArray(items)
		? Array.from(new Set(items.map((it: any) => resolveAppKey(it?.to_port, it?.from_port) as AppKey)))
		: [];
	return appKeys.length > 0 ? appKeys : ["voicemeeter"];
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
	if (!pb2cc) return null;
	const out = new Map<number, number>();
	const reverse = new Map<number, number>();
	const baseRaw = pb2cc.base_cc;
	const base = typeof baseRaw === "string" ? parseInt(baseRaw, 16) : (typeof baseRaw === "number" ? baseRaw : undefined);
	for (let ch = 1; ch <= 9; ch++) {
		let cc = pb2cc.cc_by_channel?.[ch];
		if (cc == null && base != null) {
			cc = base + (ch - 1);
		}
		if (typeof cc === "string") {
			cc = cc.startsWith("0x") ? parseInt(cc, 16) : parseInt(cc, 10);
		}
		if (typeof cc === "number") { out.set(ch, cc); reverse.set(cc, ch); }
	}
	return out.size > 0 ? { map: out, channelForCc: reverse } : null;
}

export function transformAppToXTouch(page: PageConfig, app: AppKey, entry: MidiStateEntry): MidiStateEntry | null {
	const status = entry.addr.status as MidiStatus;
	if (status === "note" || status === "pb" || status === "sysex") {
		return entry;
	}
	if (status === "cc") {
		const m = resolvePbToCcMappingForApp(page, app);
		const map = m?.map;
		if (!map) return null;
		const ccNum = entry.addr.data1 ?? -1;
		let faderChannel: number | null = null;
		for (const [ch, cc] of map.entries()) {
			if (cc === ccNum) { faderChannel = ch; break; }
		}
		if (faderChannel == null) return null;
		const v7 = typeof entry.value === "number" ? entry.value : 0;
		const v7c = Math.max(0, Math.min(127, Math.floor(v7)));
		const v14 = (v7c << 7) | (v7c & 0x01);
		return {
			addr: { portId: app, status: "pb", channel: faderChannel, data1: 0 },
			value: v14,
			ts: entry.ts,
			origin: "app",
			known: true,
			stale: entry.stale,
		};
	}
	return null;
}


