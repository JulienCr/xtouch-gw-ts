import path from "path";
import type { CliContext } from "./index";
import type { HelpRuntimeContext, HelpSpecV2 } from "./help";
import { levenshtein } from "./levenshtein";

/**
 * Calcule jusqu'à 3 suggestions de commandes proches d'une saisie inconnue.
 * Compare contre `id`, `name` et `aliases` de la spec.
 *
 * @param spec Spécification d'aide v2 (catégories/commandes)
 * @param input Chaîne entrée par l'utilisateur (commande inconnue)
 * @returns Liste (≤3) de suggestions triées par similarité croissante
 */
export function suggestFromSpec(spec: HelpSpecV2, input: string): string[] {
	const all = spec.categories.flatMap((c) => c.commands);
	const keys = new Set<string>();
	for (const c of all) {
		keys.add(c.id);
		keys.add(c.name);
		(c.aliases || []).forEach((a) => keys.add(a));
	}

	const arr = Array.from(keys);
	const scored = arr.map((k) => ({ k, d: levenshtein(k.toLowerCase(), input.toLowerCase()) }));
	scored.sort((a, b) => a.d - b.d);
	const top = scored.filter((x) => x.d <= 2).slice(0, 3);
	return top.map((x) => x.k);
}

/**
 * Construit le contexte d'en‑tête pour le rendu de l'aide (cheatsheet).
 *
 * Injecte le chemin de config, la page active, les ports MIDI X‑Touch
 * connectés, le niveau de log et les modes.
 *
 * @param ctx Contexte CLI courant (router + driver X‑Touch)
 * @returns Contexte d'exécution pour l'interpolation des items `context.items`
 */
export function buildHelpRuntimeContext(ctx: CliContext): HelpRuntimeContext {
	const configPath = path.resolve(process.cwd(), "config.yaml");
	const pageActive = (ctx.router as any).getActivePageName?.() || (ctx.router.getActivePage()?.name ?? "—");

	let midiIn = "—", midiOut = "—";
	try {
		const names = (ctx.xtouch as any)?.getConnectedPortNames?.();
		if (names) {
			midiIn = names.input || midiIn;
			midiOut = names.output || midiOut;
		}
	} catch {}

	const nowIso = new Date().toISOString();
	const logLevel = String(process.env.LOG_LEVEL || "info");
	const modes = process.env.SNIFF ? "sniff" : "";

	return { configPath, pageActive, midiIn, midiOut, logLevel, modes, nowIso };
}
