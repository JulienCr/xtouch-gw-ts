import type { Router } from "../../router";
import type { ControlMapping } from "../../types";
import { logger } from "../../logger";
import type { GamepadProvider, GamepadEvent } from "./provider-xinput";

export interface GamepadMapperOptions {
  router: Router;
  provider: GamepadProvider;
  /** Optional axis inversion config */
  invertAxes?: {
    lx?: boolean;
    ly?: boolean;
    rx?: boolean;
    ry?: boolean;
    zl?: boolean;
    zr?: boolean;
  };
}

/** Attach mapping from standardized gamepad events to router controls. */
export function attachGamepadMapper(opts: GamepadMapperOptions): () => void {
  const { router, provider, invertAxes } = opts;

  const unsub = provider.subscribe((ev: GamepadEvent) => {
    try {
      const id = ev.id;
      const page = (router as any).getActivePage?.();
      const mapping = page?.controls?.[id] as ControlMapping | undefined;
      // Log any button activity (debug visibility)
      if (ev.type === "button") {
        try { logger.info(`Gamepad: ${ev.pressed ? "press" : "release"} ${id}`); } catch {}
      }
      if (!mapping) return; // Not mapped on this page

      if (ev.type === "button") {
        // By default, only act on press unless mapping.midi requires both
        const press = !!ev.pressed;
        if (!mapping.midi) {
          if (press) {
            try { logger.info(`Gamepad → action: ${id} -> ${String(mapping.app)}.${String(mapping.action || "(action)")}`); } catch {}
            router.handleControl(id).catch(() => {});
          }
          return;
        }
        if (mapping.midi.type === "passthrough") {
          // No raw bytes available from gamepad; best-effort: emit 127/0 as scalar
          try { logger.info(`Gamepad → midi(passthrough): ${id} -> ${press ? 127 : 0}`); } catch {}
          router.handleControl(id, press ? 127 : 0).catch(() => {});
          return;
        }
        if (mapping.midi.type === "note" || mapping.midi.type === "cc") {
          try { logger.info(`Gamepad → midi(${mapping.midi.type}): ${id} -> ${press ? 127 : 0}`); } catch {}
          router.handleControl(id, press ? 127 : 0).catch(() => {});
          return;
        }
        // pb not meaningful for a button; ignore release, send center on press? Skip.
        if (press) {
          try { logger.info(`Gamepad → action(pb): ${id}`); } catch {}
          router.handleControl(id).catch(() => {});
        }
        return;
      }

      if (ev.type === "axis") {
        // Normalized values: sticks -1..1, triggers 0..1
        let v = Number(ev.value);
        if (!Number.isFinite(v)) return;

        // Apply axis inversion if configured
        const axisName = id.replace("gamepad.axis.", "");
        if (invertAxes && invertAxes[axisName as keyof typeof invertAxes]) {
          v = -v;
        }
        if (!mapping?.midi) {
          // For now: pass normalized; drivers may interpret sign separately
          try { logger.debug(`Gamepad axis: ${id} = ${v.toFixed(3)} -> action ${String(mapping.app)}.${String(mapping.action || "(action)")}`); } catch {}
          router.handleControl(id, v).catch(() => {});
          return;
        }
        if (mapping.midi.type === "cc") {
          // Heuristic: map normalized 0..1 to 0..127; for -1..1, shift to 0..1 first
          const n01 = Math.max(0, Math.min(1, (v + 1) / 2));
          const v7 = Math.round(n01 * 127);
          try { logger.debug(`Gamepad axis → cc: ${id} = ${v.toFixed(3)} -> ${v7}`); } catch {}
          router.handleControl(id, v7).catch(() => {});
          return;
        }
        if (mapping.midi.type === "note") {
          // Not meaningful for analog; treat >0.5 as press
          const press = v > 0.5;
          try { logger.debug(`Gamepad axis → note: ${id} = ${v.toFixed(3)} -> ${press ? 127 : 0}`); } catch {}
          router.handleControl(id, press ? 127 : 0).catch(() => {});
          return;
        }
        if (mapping.midi.type === "passthrough") {
          // No raw bytes; fallback to 0..127 as above
          const n01 = Math.max(0, Math.min(1, (v + 1) / 2));
          const v7 = Math.round(n01 * 127);
          try { logger.debug(`Gamepad axis → passthrough: ${id} = ${v.toFixed(3)} -> ${v7}`); } catch {}
          router.handleControl(id, v7).catch(() => {});
          return;
        }
        // pb: convert normalized 0..1 to 14-bit
        const n01 = Math.max(0, Math.min(1, (v + 1) / 2));
        const v14 = Math.round(n01 * 16383);
        try { logger.debug(`Gamepad axis → pb: ${id} = ${v.toFixed(3)} -> ${v14}`); } catch {}
        router.handleControl(id, v14).catch(() => {});
        return;
      }
    } catch (err) {
      logger.debug("GamepadMapper error:", err as any);
    }
  });

  logger.info("Gamepad: mapper attached");
  return () => { try { unsub(); } catch {} };
}
