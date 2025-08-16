import type { Router } from "../router";
import type { XTouchDriver } from "./driver";
import { F_KEY_NOTES } from "./constants";

/**
 * Allume/éteint les LEDs F1..F8 selon l'index actif.
 */
export function updateFunctionKeyLeds(x: XTouchDriver, channel1to16: number, notes: number[], activeIndex: number): void {
	const ch = Math.max(1, Math.min(16, channel1to16)) | 0;
	for (let i = 0; i < notes.length; i += 1) {
		const note = notes[i] | 0;
		const on = i === activeIndex ? 1 : 0;
		const status = 0x90 + (ch - 1);
		x.sendRawMessage([status, Math.max(0, Math.min(127, note)), on ? 0x7F : 0x00]);
	}
}

/** Met à jour les LEDs F1..F8 pour refléter la page active. */
export function updateFKeyLedsForActivePage(router: Router, x: XTouchDriver, pagingChannel: number): void {
	const pages = router.listPages();
	const activeIdx = Math.max(0, pages.findIndex((n) => n === router.getActivePageName()));
	updateFunctionKeyLeds(x, pagingChannel, F_KEY_NOTES, Math.min(activeIdx, F_KEY_NOTES.length - 1));
}

/** Allume en permanence les boutons Prev/Next de pagination. */
export function updatePrevNextLeds(x: XTouchDriver, channel1to16: number, prevNote: number, nextNote: number): void {
	const ch = Math.max(1, Math.min(16, channel1to16)) | 0;
	const status = 0x90 + (ch - 1);
	x.sendRawMessage([status, Math.max(0, Math.min(127, prevNote | 0)), 0x7F]);
	x.sendRawMessage([status, Math.max(0, Math.min(127, nextNote | 0)), 0x7F]);
}


