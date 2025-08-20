import { logger } from "../../logger";
import * as xtapi from "../../xtouch/api";
import type { CliContext } from "../types";

export const xtouchHandlers = {
	"xtouch-start": (_rest: string[], _ctx: CliContext) => {
		logger.info("Redémarrage X-Touch non supporté par la CLI extraite (nécessite la config courante). Utilisez le redémarrage de l'app.");
	},
	"xtouch:stop": (_rest: string[], ctx: CliContext) => {
		if (!ctx.xtouch) { logger.info("X-Touch déjà stoppé."); return; }
		ctx.xtouch.stop();
		ctx.xtouch = null as any;
		logger.info("X-Touch stoppé (ports libérés). Vous pouvez utiliser 'midi-open'.");
	},
	async reset(_rest: string[], ctx: CliContext) {
		if (!ctx.xtouch) { logger.warn("X-Touch non connecté"); return; }
		logger.info("Reset de la surface X-Touch...");
		try { await xtapi.resetAll(ctx.xtouch, { clearLcds: true }); logger.info("Reset terminé"); } catch (err) { logger.error("Erreur lors du reset:", err as any); }
	},
};


