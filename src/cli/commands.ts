import { logger } from "../logger";
import { loadHelpSpec, printHelp } from "./help";
import { buildHelpRuntimeContext, suggestFromSpec } from "./helpSupport";
import type { CliContext } from "./types";
import type { SessionState } from "./session";
import { midiHandlers } from "./commands/midi";
import { xtouchHandlers } from "./commands/xtouch";
import { pageHandlers } from "./commands/pages";
import { latencyHandlers } from "./commands/latency";
import { xtouchControlHandlers } from "./commands/xtouchControls";
import { stateHandlers } from "./commands/state";
import { routerHandlers } from "./commands/router";
import { testMidiSend } from "../test-midi-send";

export interface CommandHandlers {
	[name: string]: (args: string[], ctx: CliContext, session: SessionState) => Promise<void> | void;
}

export const handlers: CommandHandlers = {
	// Pages
	page: pageHandlers.page,
	pages: pageHandlers.pages,
	show: pageHandlers.show,
	// Router
	emit: routerHandlers.emit,
	// X-Touch device and controls
	"xtouch-start": xtouchHandlers["xtouch-start"],
	"xtouch:stop": xtouchHandlers["xtouch:stop"],
	"xtouch-stop": xtouchHandlers["xtouch:stop"],
	fader: xtouchControlHandlers.fader,
	lcd: xtouchControlHandlers.lcd,
	time: xtouchControlHandlers.time,
	sevenseg: xtouchControlHandlers.time,
	send: xtouchControlHandlers.send,
	// MIDI
	"midi:ports": midiHandlers["midi:ports"],
	"midi-ports": midiHandlers["midi-ports"],
	"midi:open": midiHandlers["midi:open"],
	"midi-open": midiHandlers["midi-open"],
	"midi:close": midiHandlers["midi:close"],
	"midi-close": midiHandlers["midi-close"],
	learn: midiHandlers.learn,
	// Latency
	"latency:report": latencyHandlers["latency:report"],
	"latency:reset": latencyHandlers["latency:reset"],
	// Sync/state
	sync: stateHandlers.sync,
	state: stateHandlers.state,
	// Help/misc (kept inline to avoid circular deps)
	completion(rest, ctx) {
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
	help(rest, ctx) {
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
	version(_rest, _ctx) {
		try {
			const spec = loadHelpSpec();
			const v = spec.meta?.version || require("../../package.json").version || "0.0.0";
			logger.info(`xtouch-gw ${v}`);
		} catch { logger.info("xtouch-gw"); }
	},
	async "test:midi"(rest, ctx) {
		const which = (rest[0] || "all").toLowerCase();
		logger.info(`Test MIDI → ${which}`);
		try { await testMidiSend(ctx.xtouch || undefined, { testMode: which as any }); }
		catch (e) { logger.error("Erreur test-midi:", e as any); }
	},
	"test-midi": (rest, ctx, s) => handlers["test:midi"]!(rest, ctx, s),
	async default(rest, ctx) {
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
	},
};


