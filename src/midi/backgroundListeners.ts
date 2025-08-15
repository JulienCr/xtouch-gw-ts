import { Input } from "@julusian/midi";
import type { Router } from "../router";
import type { PageConfig, TransformConfig } from "../config";
import { findPortIndexByNameFragment } from "../midi/ports";
import { human, hex } from "../midi/utils";
import { logger } from "../logger";
import { resolveAppKey } from "../shared/appKey";

type BgInfo = { inp: Input; appKey: string };

export class BackgroundListenerManager {
	private readonly backgroundInputs = new Map<string, BgInfo>();
	private readonly bgRetryTimers = new Map<string, { count: number; timer: NodeJS.Timeout }>();

	constructor(private readonly router: Router) {}

	shutdown(): void {
		try { for (const h of this.backgroundInputs.values()) { h.inp.closePort(); } } catch {}
		this.backgroundInputs.clear();
		for (const t of this.bgRetryTimers.values()) { try { clearTimeout(t.timer); } catch {} }
		this.bgRetryTimers.clear();
	}

	private scheduleRetry(from: string, info: { appKey: string; transform?: TransformConfig }): void {
		const prev = this.bgRetryTimers.get(from);
		const nextCount = (prev?.count ?? 0) + 1;
		if (nextCount > 5) {
			logger.warn(`Background listener retry abandonné '${from}' après ${nextCount - 1} tentatives.`);
			return;
		}
		if (prev) {
			try { clearTimeout(prev.timer); } catch {}
		}
		const timer = setTimeout(() => {
			try {
				const inp = new Input();
				const idx = findPortIndexByNameFragment(inp, from);
				if (idx == null) {
					inp.closePort?.();
					logger.warn(`Background listener (retry): port IN introuvable '${from}'.`);
					this.scheduleRetry(from, info);
					return;
				}
				inp.ignoreTypes(false, false, false);
				inp.on("message", (_delta, data) => {
					try {
						try { logger.debug(`Background RX <- ${from}: ${human(data)} [${hex(data)}] (app=${info.appKey})`); } catch {}
						this.router.onMidiFromApp(info.appKey, data, from);
					} catch (err) {
						logger.debug("Background listener error:", err as any);
					}
				});
				inp.openPort(idx);
				this.backgroundInputs.set(from, { inp, appKey: info.appKey });
				try { logger.info(`Background listener ON (retry ${nextCount}): '${from}'.`); } catch {}
				// Clear retry timer on success
				const cur = this.bgRetryTimers.get(from);
				if (cur) {
					try { clearTimeout(cur.timer); } catch {}
					this.bgRetryTimers.delete(from);
				}
			} catch (err) {
				logger.warn(`Background listener retry failed '${from}':`, err as any);
				this.scheduleRetry(from, info);
			}
		}, Math.min(2000, 200 * nextCount));
		this.bgRetryTimers.set(from, { count: nextCount, timer });
		logger.info(`Background listener RETRY ${nextCount}: '${from}' dans ${Math.min(2000, 200 * nextCount)}ms.`);
	}

	rebuild(activePage: PageConfig | undefined, allPages: PageConfig[] | undefined): void {
		const pages = allPages ?? [];
		// Ports 'from' utilisés par la page active (à ne pas écouter en doublon)
		const activeFroms = new Set<string>();
		const itemsActive = (activePage as any)?.passthroughs ?? ((activePage as any)?.passthrough ? [(activePage as any).passthrough] : []);
		for (const it of (itemsActive as any[])) {
			if (it?.from_port) activeFroms.add(it.from_port);
		}
		// Construire la cible: tous les from_ports des autres pages
		const desired = new Map<string, { appKey: string; transform?: TransformConfig }>();
		for (const p of pages) {
			const items = (p as any).passthroughs ?? ((p as any).passthrough ? [(p as any).passthrough] : []);
			for (const it of (items as any[])) {
				const from = it?.from_port;
				if (!from || activeFroms.has(from)) continue;
				if (!desired.has(from)) desired.set(from, { appKey: resolveAppKey(it?.to_port, from), transform: it?.transform });
			}
		}
		// Fermer les obsolètes
		for (const [from, h] of this.backgroundInputs) {
			if (!desired.has(from)) {
				try { h.inp.closePort(); } catch {}
				this.backgroundInputs.delete(from);
				logger.info(`Background listener OFF: '${from}'.`);
			}
		}
		// Ouvrir les nouveaux
		for (const [from, info] of desired) {
			if (this.backgroundInputs.has(from)) continue;
			try {
				const inp = new Input();
				const idx = findPortIndexByNameFragment(inp, from);
				if (idx == null) {
					inp.closePort?.();
					logger.warn(`Background listener: port IN introuvable '${from}'.`);
					this.scheduleRetry(from, info);
					continue;
				}
				inp.ignoreTypes(false, false, false);
				inp.on("message", (_delta, data) => {
					try {
						try { logger.debug(`Background RX <- ${from}: ${human(data)} [${hex(data)}] (app=${info.appKey})`); } catch {}
						this.router.onMidiFromApp(info.appKey, data, from);
					} catch (err) {
						logger.debug("Background listener error:", err as any);
					}
				});
				inp.openPort(idx);
				this.backgroundInputs.set(from, { inp, appKey: info.appKey });
				logger.info(`Background listener ON: '${from}'.`);
			} catch (err) {
				logger.warn(`Background listener open failed '${from}':`, err as any);
				this.scheduleRetry(from, info);
			}
		}
	}
}


