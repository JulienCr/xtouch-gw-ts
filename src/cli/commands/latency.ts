import { logger } from "../../logger";
import type { CliContext } from "../types";

export const latencyHandlers = {
	"latency:report": (_rest: string[], ctx: CliContext) => {
		const rpt = (ctx.router as any).getLatencyReport?.();
		if (!rpt) { logger.warn("Latence: fonctionnalité non disponible."); return; }
		for (const app of Object.keys(rpt)) {
			const s = (rpt as any)[app];
			const line = (k: string) => { const it = s[k]; return `${k}: n=${it.count} p50=${it.p50}ms p95=${it.p95}ms max=${it.max}ms last=${it.last}ms`; };
			logger.info(`[${app}] ${line("note")} | ${line("cc")} | ${line("pb")} | ${line("sysex")}`);
		}
	},
	"latency:reset": (_rest: string[], ctx: CliContext) => {
		if (typeof (ctx.router as any).resetLatency === "function") (ctx.router as any).resetLatency();
		logger.info("Latence: compteurs réinitialisés.");
	},
};


