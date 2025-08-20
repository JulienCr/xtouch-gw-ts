import type { Router } from "../router";
import type { XTouchDriver } from "./driver";
declare const process: any;
import { logger } from "../logger";

import { getInputLookups } from "./matching";

export interface InputMapperOptions {
  router: Router;
  xtouch: XTouchDriver;
  mode: "mcu" | "ctrl";
  channel?: number; // default 1
  matchingCsvPath?: string; // default docs/xtouch-matching.csv
}

/**
 * Mappe génériquement les entrées X‑Touch (Note/CC/PB) vers des `control_id` logiques via le CSV,
 * puis les transmet à `router.handleControl(control_id, valueOptionnel)`.
 */
export async function attachInputMapper(opts: InputMapperOptions): Promise<() => void> {
  const { router, xtouch, mode } = opts;
  const channel = opts.channel ?? 1;
  const { noteToControl, ccToControl, pbChannelToControl } = getInputLookups(mode, opts.matchingCsvPath);

  const unsub = xtouch.subscribe((_delta, data) => {
    try {
      const status = data[0] ?? 0;
      const typeNibble = (status & 0xf0) >> 4;
      const ch1 = (status & 0x0f) + 1;
      if (typeNibble === 0x9) {
        // Only handle Note on the configured paging channel
        if (ch1 !== (channel | 0)) return;
        // Note On (treat vel 0 as off; only handle press)
        const note = data[1] ?? 0;
        const vel = data[2] ?? 0;
        if (vel <= 0) return;
        const id = noteToControl.get(note);
        if (id) router.handleControl(id).catch(() => {});
        return;
      }
      if (typeNibble === 0xB) {
        // Only handle CC on the configured paging channel
        if (ch1 !== (channel | 0)) return;
        // Control Change 0..127, value 0..127
        const cc = data[1] ?? 0;
        const v = data[2] ?? 0;
        const id = ccToControl.get(cc);
        if (id) router.handleControl(id, v).catch(() => {});
        return;
      }
      if (typeNibble === 0xE) {
        // Pitch Bend 14 bits (faders en mode MCU)
        // Acheminer vers les contrôles PB selon leur canal (défini dans le CSV: pb=chN)
        const lsb = data[1] ?? 0;
        const msb = data[2] ?? 0;
        const value14 = ((msb & 0x7f) << 7) | (lsb & 0x7f);
        const chPb = (status & 0x0f) + 1;
        const id = pbChannelToControl.get(chPb);
        if (id) {
          // N'émettre PB→handleControl que si la page active a un mapping pour cet id
          try {
            const page = (router as any).getActivePage?.();
            if (page && page.controls && Object.prototype.hasOwnProperty.call(page.controls, id)) {
              router.handleControl(id, value14).catch(() => {});
            }
          } catch {}
        }
        return;
      }
    } catch (err) {
      logger.debug("InputMapper error:", err as any);
    }
  });

  logger.info("InputMapper: attached (mode=%s, ch=%d)", mode, channel);
  return () => { try { unsub(); } catch {} };
}


