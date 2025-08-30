import type { Router } from "../router";
import type { XTouchDriver } from "./driver";
import type { XTouchMode } from "../config";
import { getInputLookups } from "./matching";
import { clamp } from "../shared/num";

/**
 * Allume/éteint les LEDs F1..F8 selon l'index actif.
 */
function updateFunctionKeyLeds(x: XTouchDriver, channel1to16: number, notes: number[], activeIndex: number): void {
	const ch = clamp(channel1to16 | 0, 1, 16);
	const idx = clamp(activeIndex | 0, -1, notes.length - 1);
	for (let i = 0; i < notes.length; i += 1) {
		const note = notes[i] | 0;
		const vel = i === idx ? 127 : 0;
		x.sendNoteOn(ch, note, vel);
	}
}

/** Met à jour les LEDs F1..F8 pour refléter la page active. */
function getFKeyNotes(mode: XTouchMode): number[] {
  const lookup = getInputLookups(mode);
  const noteByControl = new Map<string, number>();
  for (const [note, ctrlId] of lookup.noteToControl.entries()) {
    noteByControl.set(ctrlId, note);
  }
  const out: number[] = [];
  for (let i = 1; i <= 8; i += 1) {
    const n = noteByControl.get(`f${i}`);
    if (typeof n === "number") out.push(n);
  }
  return out;
}

export function updateFKeyLedsForActivePage(router: Router, x: XTouchDriver, pagingChannel: number, mode: XTouchMode): void {
	const pages = router.listPages();
	const activeIdx = Math.max(0, pages.findIndex((n) => n === router.getActivePageName()));
	const notes = getFKeyNotes(mode);
	updateFunctionKeyLeds(x, pagingChannel, notes, Math.min(activeIdx, Math.max(0, notes.length - 1)));
}

/** Allume en permanence les boutons Prev/Next de pagination. */
export function updatePrevNextLeds(x: XTouchDriver, channel1to16: number, prevNote: number, nextNote: number): void {
	const ch = clamp(channel1to16 | 0, 1, 16);
	x.sendNoteOn(ch, prevNote | 0, 127);
	x.sendNoteOn(ch, nextNote | 0, 127);
}
