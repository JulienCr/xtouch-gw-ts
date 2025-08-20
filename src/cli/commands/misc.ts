import { logger } from "../../logger";
import { loadHelpSpec, printHelp } from "../help";
import { buildHelpRuntimeContext, suggestFromSpec } from "../helpSupport";
import type { CliContext } from "../types";

export const miscHandlers = {
	completion(rest: string[], _ctx: CliContext) {
		const target = (rest[0] || "zsh").toLowerCase();
		try {
			const spec = loadHelpSpec();
			if (target === "zsh") {
				const cmds = spec.categories.flatMap((c) => c.commands.map((x) => x.name));
				const aliases = spec.categories.flatMap((c) => c.commands.flatMap((x) => x.aliases || []));
				const all = Array.from(new Set(["help", "exit", ...cmds, ...aliases]));
				const script = `#compdef xtouch-gw\n_arguments '*::command:->cmds'\ncase $state in\n  cmds)\n    _values 'commands' ${all.map((c) => `\\"${c}\\"`).join(" ")};;\n  esac\n`;
				process.stdout.write(script + "\n");
			} else if (target === "bash" || target === "powershell") {
				const all = spec.categories.flatMap((c) => c.commands.map((x) => x.name)).join(" ");
				process.stdout.write(`# Commands:\n${all}\n`);
			} else {
				logger.warn("Shell non supporté. Utilisez: completion <bash|zsh|powershell>");
			}
		} catch (e) {
			logger.warn("Impossible de générer l'autocomplétion:", e as any);
		}
	},
	help(rest: string[], ctx: CliContext) {
		try {
			const spec = loadHelpSpec();
			const runtime = buildHelpRuntimeContext(ctx);
			const arg = rest.join(" ").trim();
			if (arg === "--json" || arg === "json") { printHelp(spec, runtime, { kind: "json" }); return; }
			if (!arg) { printHelp(spec, runtime); return; }
			if (arg === "all") { printHelp(spec, runtime, { kind: "all" }); return; }
			if (arg === "examples") { printHelp(spec, runtime, { kind: "examples" }); return; }
			if (arg.startsWith("search ")) { printHelp(spec, runtime, { kind: "search", value: arg.slice(7) }); return; }
			const cat = spec.categories.find((c) => c.id === arg || c.title.toLowerCase().includes(arg.toLowerCase()));
			if (cat) { printHelp(spec, runtime, { kind: "category", value: cat.id }); return; }
			printHelp(spec, runtime, { kind: "command", value: arg });
		} catch (err) {
			process.stdout.write("Aide CLI indisponible (help.yaml introuvable ou invalide).\n");
		}
	},
	version(_rest: string[], _ctx: CliContext) {
		try {
			const spec = loadHelpSpec();
			const v = spec.meta?.version || require("../../../package.json").version || "0.0.0";
			logger.info(`xtouch-gw ${v}`);
		} catch {
			logger.info("xtouch-gw");
		}
	},
	unknown(rest: string[], ctx: CliContext) {
		const cmd = rest[0] || "";
		if (cmd.length > 0) {
			try {
				const spec = loadHelpSpec();
				const runtime = buildHelpRuntimeContext(ctx);
				const s = suggestFromSpec(spec, cmd);
				logger.warn("Commande inconnue. Tapez 'help'.");
				if (s.length > 0) process.stdout.write(`Suggestions: ${s.join(", ")}` + "\n");
				printHelp(spec, runtime, { kind: "category", value: "basics" });
			} catch { logger.warn("Commande inconnue."); }
		}
	}
};


