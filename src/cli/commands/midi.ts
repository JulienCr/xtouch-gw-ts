import { logger } from "../../logger";
import { listInputPorts, MidiInputSniffer } from "../../midi/sniffer";
import { formatDecoded } from "../../midi/decoder";
import type { CliContext } from "../types";
import type { SessionState } from "../session";

const toHex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");

export const midiHandlers = {
	learn(rest: string[], _ctx: CliContext, s: SessionState) {
		const id = rest.join(" ");
		if (!id) { logger.warn("Usage: learn <id>"); return; }
		if (!s.midiSniffer) { logger.warn("Ouvrez un port d'entrée d'abord: 'midi-ports' puis 'midi-open <idx|name>'"); return; }
		s.pendingLearnControlId = id;
		logger.info(`Learn armé pour '${id}'. Touchez un contrôle sur la X-Touch…`);
	},
	"midi:ports": (_rest: string[], _ctx: CliContext) => {
		const ports = listInputPorts();
		if (ports.length === 0) logger.info("Aucun port MIDI d'entrée détecté.");
		else for (const p of ports) logger.info(`[${p.index}] ${p.name}`);
	},
	"midi-ports": (rest: string[], ctx: CliContext, _s: SessionState) => midiHandlers["midi:ports"](rest, ctx),
	"midi:open": (rest: string[], _ctx: CliContext, s: SessionState) => {
		const arg = rest.join(" ");
		if (!arg) { logger.warn("Usage: midi:open <idx|name>"); return; }
		const n = Number(arg);
		if (!s.midiSniffer) {
			s.midiSniffer = new MidiInputSniffer((evt) => {
				logger.debug(`MIDI IN: ${toHex(evt.bytes)} (Δ=${evt.deltaSeconds.toFixed(3)}s)`);
				logger.info(formatDecoded(evt.decoded));
				if (s.pendingLearnControlId) {
					const learnedFor = s.pendingLearnControlId;
					s.pendingLearnControlId = null;
					const d = evt.decoded as any;
					let detector = "";
					let suggestedId = learnedFor;
					if (d.type === "pitchBend") {
						detector = `pb:${d.channel}`;
						if (/^fader\d+$/.test(learnedFor) === false && d.channel) suggestedId = `fader${d.channel}`;
					} else if (d.type === "controlChange") {
						detector = `cc:${d.channel}:${d.controller}`;
						if (/^enc(oder)?\d+/.test(learnedFor) === false) suggestedId = d.channel && d.channel !== 1 ? `enc${d.controller}_ch${d.channel}` : `enc${d.controller}`;
					} else if (d.type === "noteOn" || d.type === "noteOff") {
						detector = `note:${d.channel}:${d.note}`;
						if (/^button\d+/.test(learnedFor) === false) suggestedId = d.channel && d.channel !== 1 ? `button${d.note}_ch${d.channel}` : `button${d.note}`;
					} else {
						detector = d.type;
					}
					const yamlLine = `${suggestedId}: { app: "console", action: "log", params: [] }`;
					logger.info("LEARN →", formatDecoded(evt.decoded));
					logger.info("Proposition controlId:", suggestedId);
					logger.info("Détecteur:", detector);
					logger.info("YAML:");
					logger.info(yamlLine);
				}
			});
		}
		if (Number.isFinite(n)) s.midiSniffer.openByIndex(n);
		else {
			const ok = s.midiSniffer.openByName(arg);
			if (!ok) logger.warn("Port non trouvé par nom.");
		}
	},
	"midi-open": (rest: string[], ctx: CliContext, s: SessionState) => midiHandlers["midi:open"](rest, ctx, s),
	"midi:close": (_rest: string[], _ctx: CliContext, s: SessionState) => { s.midiSniffer?.close(); },
	"midi-close": (rest: string[], ctx: CliContext, s: SessionState) => midiHandlers["midi:close"](rest, ctx, s),
};


