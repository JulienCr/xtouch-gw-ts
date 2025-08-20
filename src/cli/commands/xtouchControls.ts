import { logger } from "../../logger";
import type { CliContext } from "../types";
import { parseCommand } from "../../midi/testDsl";

export const xtouchControlHandlers = {
	async fader(rest: string[], ctx: CliContext) {
		const ch = Number(rest[0]);
		const v = Number(rest[1]);
		if (!Number.isFinite(ch) || !Number.isFinite(v)) { logger.warn("Usage: fader <ch> <0..16383>"); return; }
		if (!ctx.xtouch) { logger.warn("X-Touch non connecté (vérifiez config.yaml et le câblage)"); return; }
		ctx.xtouch.setFader14(ch, v);
		logger.info(`Fader ${ch} ← ${v}`);
	},
	async lcd(rest: string[], ctx: CliContext) {
		const strip = Number(rest[0]);
		const upper = rest[1];
		const lower = rest.slice(2).join(" ") || "";
		if (!Number.isFinite(strip) || !upper) { logger.warn("Usage: lcd <strip0-7> <upper> [lower]"); return; }
		if (!ctx.xtouch) { logger.warn("X-Touch non connecté"); return; }
		ctx.xtouch.sendLcdStripText(strip, upper, lower);
		logger.info(`LCD[${strip}] ← '${upper}' | '${lower}'`);
	},
	async time(rest: string[], ctx: CliContext) {
		const text = rest.join(" ") || "";
		if (!ctx.xtouch) { logger.warn("X-Touch non connecté"); return; }
		ctx.xtouch.setSevenSegmentText(text);
		logger.info(`7-seg ← '${text}'`);
	},
	async send(rest: string[], ctx: CliContext) {
		if (!ctx.xtouch) { logger.warn("X-Touch non connecté"); return; }
		const cmdLine = rest.join(" ");
		if (!cmdLine) {
			logger.warn("Usage: send <command>");
			logger.info("Exemples (support décimal, hex 0x, et hex avec suffixe n):");
			logger.info("  send noteon ch=1 note=118 velocity=127");
			logger.info("  send noteon ch=1 note=0x76 velocity=0x7F");
			logger.info("  send noteon ch=1 note=0x1n velocity=0x1n");
			logger.info("  send noteoff ch=1 note=0x76");
			logger.info("  send cc ch=1 cc=0x10 value=0x40");
			logger.info("  send pb ch=1 value=8192");
			logger.info("  send raw 90 76 7F");
			return;
		}
		if (cmdLine.startsWith("raw ")) {
			const hexBytes = cmdLine.substring(4).split(/\s+/);
			const bytes: number[] = [];
			let valid = true;
			for (const hex of hexBytes) {
				const byte = parseInt(hex, 16);
				if (!Number.isFinite(byte) || byte < 0 || byte > 255) { logger.warn(`Octet invalide: ${hex} (attendu: 00..FF)`); valid = false; break; }
				bytes.push(byte);
			}
			if (valid && bytes.length > 0) {
				ctx.xtouch.sendRawMessage(bytes);
				logger.info(`MIDI → Raw (${bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')})`);
			}
			return;
		}
		const parsed = parseCommand(cmdLine, { defaultDelayMs: 0, noteOffAsNoteOn0: false });
		if (!parsed) { logger.warn("Commande non reconnue"); logger.info("Formats supportés: noteon, noteoff, cc, raw"); return; }
		if (parsed.kind === "Wait") { logger.warn("Wait non supporté dans send (utilisez test-midi)"); return; }
		if (parsed.kind === "Raw") {
			ctx.xtouch.sendRawMessage(parsed.bytes);
			logger.info(`MIDI → ${parsed.label} (${parsed.bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')})`);
		}
	},
};


