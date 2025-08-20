import { logger } from "../../logger";
import type { CliContext } from "../types";

export const pageHandlers = {
	async page(rest: string[], ctx: CliContext) {
		const arg = rest.join(" ");
		const n = Number(arg);
		const ok = Number.isFinite(n) ? ctx.router.setActivePage(n) : ctx.router.setActivePage(arg);
		if (!ok) logger.warn("Page inconnue.");
	},
	pages(_rest: string[], ctx: CliContext) {
		logger.info("Pages:", ctx.router.listPages().join(", "));
	},
	show(rest: string[], ctx: CliContext) {
		const subcmd = rest[0];
		if (subcmd === "pages") {
			const pages = ctx.router.listPages();
			if (pages.length === 0) { logger.info("Aucune page configurée"); }
			else {
				logger.info("Pages disponibles:");
				for (let i = 0; i < pages.length; i++) {
					const page = ctx.router.getActivePage();
					const isActive = page && page.name === pages[i];
					const marker = isActive ? " → " : "   ";
					logger.info(`${marker}[${i + 1}] ${pages[i]}`);
				}
			}
		} else {
			logger.warn("Usage: show <pages>");
			logger.info("  show pages - Liste les pages avec index (1,2,3...)");
		}
	},
};


