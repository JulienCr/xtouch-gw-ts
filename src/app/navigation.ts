import type { Router } from "../router";
import type { XTouchDriver } from "../xtouch/driver";
import type { PagingConfig, PageConfig, XTouchMode } from "../config";
import { updatePrevNextLeds } from "../xtouch/fkeys";
import { getInputLookups } from "../xtouch/matching";

export interface NavigationDeps {
  /** Router applicatif contrôlant les pages */
  router: Router;
  /** Driver X‑Touch initialisé et démarré */
  xtouch: XTouchDriver;
  /** Configuration de pagination (canal + notes prev/next) */
  paging: Required<PagingConfig>;
  mode: XTouchMode;
  /** Callback invoqué après un changement de page effectif */
  onAfterPageChange?: (page: PageConfig | undefined) => void;
}

/**
 * Attache les raccourcis de navigation de pages au X‑Touch.
 *
 * - Prev/Next via deux notes configurables (par défaut 46/47 sur le canal paging)
 * - Accès direct pages 1..8 via notes 54..61 (F1..F8) sur le canal paging
 * - Anti-rebond 250 ms pour éviter les doubles déclenchements
 *
 * @returns Fonction d'unsubscribe pour détacher les listeners
 */
export function attachNavigation(deps: NavigationDeps): () => void {
  const { router, xtouch, paging, mode, onAfterPageChange } = deps;
  let cooldownUntil = 0;
  const fkeyNotes = (() => {
    try {
      const { noteToControl } = getInputLookups(mode);
      const noteByControl = new Map<string, number>();
      for (const [note, ctrl] of noteToControl.entries()) noteByControl.set(ctrl, note);
      const arr: number[] = [];
      for (let i = 1; i <= 8; i += 1) {
        const n = noteByControl.get(`f${i}`);
        if (typeof n === "number") arr.push(n);
      }
      return arr;
    } catch {
      return [54,55,56,57,58,59,60,61];
    }
  })();

  const unsub = xtouch.subscribe((_delta, data) => {
    const status = data[0] ?? 0;
    const type = (status & 0xf0) >> 4;
    const ch = (status & 0x0f) + 1;

    const d1 = data[1] ?? 0;
    const d2 = data[2] ?? 0;
    const now = Date.now();
    if (now < cooldownUntil) return;

    // Notes: navigation
    if (type === 0x9 && ch === paging.channel) {
      const note = d1;
      const vel = d2;
      if (vel <= 0) return;
      let changed = false;
      if (note === paging.prev_note || note === paging.next_note) {
        if (note === paging.prev_note) { router.prevPage(); changed = true; }
        if (note === paging.next_note) { router.nextPage(); changed = true; }
      } else {
        const idx = fkeyNotes.indexOf(note);
        if (idx >= 0) { router.setActivePage(idx); changed = true; }
      }
      if (!changed) return;
      cooldownUntil = now + 250;
      onAfterPageChange?.(router.getActivePage());
      try { updatePrevNextLeds(xtouch, paging.channel, paging.prev_note, paging.next_note); } catch {}
      return;
    }

    

  });

  return () => {
    try { unsub(); } catch {}
  };
}
