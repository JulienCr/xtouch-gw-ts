import type { XTouchDriver } from "./driver";
import { getInputLookups } from "./matching";
import { isPB, isCC, pb14FromRaw } from "../midi/utils";
import { toPercentFrom14bit, to7bitFrom14bit, to8bitFrom14bit } from "../midi/convert"; // MODIF: centraliser conversions
import type { AppConfig, PageConfig } from "../config";
import type { ControlMapping } from "../types";

/**
 * Affiche en temps réel la valeur d'un fader sur la ligne basse du LCD correspondant pendant le touch,
 * puis restaure le libellé bas (vide) à la fin du mouvement.
 */
/**
 * Attache un overlay de valeur sur la ligne basse des scribble strips pendant le mouvement d'un fader.
 * - MCU (PB): affiche un pourcentage arrondi (0..100%).
 * - CTRL (CC): affiche 0..127 (7-bit) ou 0..255 (8-bit) selon config.
 * - À la fin du touch (Note vel=0), restaure le texte bas issu des labels de la page active.
 *
 * @param xtouch Driver X‑Touch
 * @param getActivePage Fonction retournant la page active courante (pour restaurer les labels)
 * @param cfg Configuration applicative pour options (mode, overlay)
 * @returns unsubscribe
 */
export function attachFaderValueOverlay(
  xtouch: XTouchDriver,
  getActivePage: () => PageConfig | undefined,
  cfg: AppConfig
): () => void {
  const mode = cfg.xtouch?.mode ?? "mcu";
  const overlayEnabled = cfg.xtouch?.overlay?.enabled !== false;
  if (!overlayEnabled) return () => {};

  const ccBits = cfg.xtouch?.overlay?.cc_bits === "8bit" ? 8 : 7;
  const pagingChannel = (cfg.paging?.channel ?? 1) | 0;
  const { pbChannelToControl, ccToControl, noteToControl } = getInputLookups(mode);

  // Map control_id -> strip index (0..7) when possible
  const controlIdToStrip = new Map<string, number>();
  for (let i = 0; i < 8; i++) controlIdToStrip.set(`fader${i + 1}`, i);
  // master n'a pas de scribble strip dédié sur la X-Touch standard; ignorer

  const activeTouches = new Set<number>(); // strip indices being touched

  function getBaselineLowerForStrip(strip: number): string {
    try {
      const page = getActivePage();
      const labels = (page as any)?.lcd?.labels as Array<string | { upper?: string; lower?: string }> | undefined;
      if (!Array.isArray(labels)) return "";
      const item = labels[strip];
      if (typeof item === "string") {
        const parts = item.split(/\r?\n/, 2);
        return parts[1] || "";
      }
      if (item && typeof item === "object") {
        return (item as any).lower || "";
      }
    } catch {}
    return "";
  }

  function getOverlayModeForStrip(strip: number): { enabled: boolean; mode: "percent" | "7bit" | "8bit" } {
    try {
      const page = getActivePage();
      const controls = (page as any)?.controls as Record<string, unknown> | undefined;
      const appNameForStrip = (() => {
        try {
          const controlId = `fader${strip + 1}`;
          const mapping = controls?.[controlId] as ControlMapping | undefined;
          return mapping?.app?.trim();
        } catch { return undefined; }
      })();
      if (controls) {
        const controlId = `fader${strip + 1}`;
        const mapping = controls[controlId] as ControlMapping | undefined;
        const enabled = mapping?.overlay?.enabled !== false; // default true
        const resolvedMode: "percent" | "7bit" | "8bit" = (mapping?.overlay?.mode as any)
          || (() => {
            // 1) per-app defaults
            const appKey = appNameForStrip || "";
            const perApp = (cfg.xtouch?.overlay_per_app || {})[appKey];
            if (perApp && perApp.mode) return perApp.mode;
            // 2) global/default fallback (depends on mode)
            return (mode === "mcu") ? "percent" : (ccBits === 8 ? "8bit" : "7bit");
          })();
        if (enabled) return { enabled, mode: resolvedMode };
        return { enabled: false, mode: "percent" };
      }
    } catch {}
    // Defaults: enabled, percent for MCU; for CTRL: respect ccBits default
    return { enabled: true, mode: (mode === "mcu" ? "percent" : (ccBits === 8 ? "8bit" : "7bit")) };
  }

  const handler = (_delta: number, data: number[]) => {
    const status = data[0] ?? 0;
    const typeNibble = (status & 0xf0) >> 4;
    const ch1 = (status & 0x0f) + 1;

    // TOUCH detection (Note On on matched fader_touch note) via CSV, only on paging channel
    if (typeNibble === 0x9 || typeNibble === 0x8) {
      if (ch1 === pagingChannel) {
        const note = data[1] ?? 0;
        const vel = data[2] ?? 0;
        const id = noteToControl.get(note);
        if (id && id.endsWith("_touch")) {
          const baseId = id.replace(/_touch$/, "");
          const strip = controlIdToStrip.get(baseId);
          if (strip != null) {
            if (vel > 0) {
              activeTouches.add(strip);
            } else {
              activeTouches.delete(strip);
              const baseline = getBaselineLowerForStrip(strip);
              try { xtouch.sendLcdStripLowerText(strip, baseline); } catch {}
            }
          }
          return;
        }
      }
    }

    // VALUE updates during touch
    if (isPB(status)) {
      // MCU PB: value14 -> percent
      const lsb = data[1] ?? 0;
      const msb = data[2] ?? 0;
      const value14 = pb14FromRaw(lsb, msb);
      const ctrlId = pbChannelToControl.get(ch1);
      if (!ctrlId) return;
      const strip = controlIdToStrip.get(ctrlId);
      if (strip == null || !activeTouches.has(strip)) return;
      const ov = getOverlayModeForStrip(strip);
      if (!ov.enabled) return;
      const pct = toPercentFrom14bit(value14); // MODIF
      if (ov.mode === "percent") {
        try { xtouch.sendLcdStripLowerText(strip, `${pct}%`); } catch {}
      } else if (ov.mode === "7bit") {
        const v7 = to7bitFrom14bit(value14); // MODIF
        try { xtouch.sendLcdStripLowerText(strip, `${v7}`); } catch {}
      } else {
        const v8 = to8bitFrom14bit(value14); // MODIF
        try { xtouch.sendLcdStripLowerText(strip, `${v8}`); } catch {}
      }
      return;
    }

    if (isCC(status)) {
      // CTRL mode: CC 0..127; only handle on paging channel for consistency
      if (ch1 !== pagingChannel) return;
      const cc = data[1] ?? 0;
      const v7 = data[2] ?? 0;
      const ctrlId = ccToControl.get(cc);
      if (!ctrlId || !ctrlId.startsWith("fader")) return;
      const strip = controlIdToStrip.get(ctrlId);
      if (strip == null || !activeTouches.has(strip)) return;
      const ov = getOverlayModeForStrip(strip);
      if (!ov.enabled) return;
      if (ov.mode === "8bit") {
        const v8 = Math.round((v7 / 127) * 255);
        try { xtouch.sendLcdStripLowerText(strip, `${v8}`); } catch {}
      } else if (ov.mode === "7bit") {
        try { xtouch.sendLcdStripLowerText(strip, `${v7}`); } catch {}
      } else {
        const pct = Math.round((v7 / 127) * 100);
        try { xtouch.sendLcdStripLowerText(strip, `${pct}%`); } catch {}
      }
      return;
    }
  };

  const unsub = xtouch.subscribe(handler);
  return () => {
    try { unsub(); } catch {}
  };
}


