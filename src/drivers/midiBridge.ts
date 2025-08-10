import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";
import type { XTouchDriver } from "../xtouch/driver";
import type { MidiFilterConfig, TransformConfig } from "../config";
import { hex, human } from "../midi/utils";
import { matchFilter } from "../midi/filter";
import { applyTransform, applyReverseTransform } from "../midi/transform";
import { findPortIndexByNameFragment } from "../midi/ports";

// findPortIndexByNameFragment désormais importé depuis src/midi/ports.ts


export class MidiBridgeDriver implements Driver {
  readonly name = "midi-bridge";
  private outToTarget: Output | null = null;
  private inFromTarget: Input | null = null;
  private unsubXTouch?: () => void;

  constructor(
    private readonly xtouch: XTouchDriver,
    private readonly toPort: string,
    private readonly fromPort: string,
    private readonly filter?: MidiFilterConfig,
    private readonly transform?: TransformConfig,
    private readonly optional: boolean = true,
    private readonly onFeedbackFromApp?: (raw: number[]) => void
  ) {}

  async init(): Promise<void> {
    try {
      const out = new Output();
      const outIdx = findPortIndexByNameFragment(out, this.toPort);
      if (outIdx == null) {
        out.closePort?.();
        if (this.optional) {
          logger.warn(`MidiBridge: port OUT introuvable '${this.toPort}' (optional).`);
        } else {
          throw new Error(`Port OUT introuvable pour '${this.toPort}'`);
        }
      } else {
        out.openPort(outIdx);
        this.outToTarget = out;
      }

      const inp = new Input();
      const inIdx = findPortIndexByNameFragment(inp, this.fromPort);
      if (inIdx == null) {
        inp.closePort?.();
        if (this.optional) {
          logger.warn(`MidiBridge: port IN introuvable '${this.fromPort}' (optional).`);
        } else {
          throw new Error(`Port IN introuvable pour '${this.fromPort}'`);
        }
      } else {
        inp.ignoreTypes(false, false, false);
        inp.on("message", (_delta, data) => {
          logger.debug(`Bridge RX <- ${this.fromPort}: ${human(data)} [${hex(data)}]`);
          try {
            const txToXTouch = applyReverseTransform(data, this.transform);
            // Alimenter le StateStore avec la version la plus utile pour le refresh
            try {
              if (txToXTouch) this.onFeedbackFromApp?.(txToXTouch);
              this.onFeedbackFromApp?.(data);
            } catch {}
            if (!txToXTouch) {
              logger.debug(`Bridge DROP (reverse transformed to null) -> X-Touch: ${human(data)} [${hex(data)}]`);
              return;
            }
            logger.debug(`Bridge RX transform -> X-Touch: ${human(txToXTouch)} [${hex(txToXTouch)}]`);
            this.xtouch.sendRawMessage(txToXTouch);
          } catch (err) {
            logger.warn("Bridge reverse send error:", err as any);
          }
        });
        inp.openPort(inIdx);
        this.inFromTarget = inp;
      }

      if (this.outToTarget) {
        this.unsubXTouch = this.xtouch.subscribe((_delta, data) => {
          try {
            if (matchFilter(data, this.filter)) {
               const tx = applyTransform(data, this.transform);
              if (!tx) {
                logger.debug(`Bridge DROP (transformed to null) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
                return;
              }
              logger.debug(`Bridge TX -> ${this.toPort}: ${human(tx)} [${hex(tx)}]`);
              this.outToTarget?.sendMessage(tx);
            } else {
              logger.debug(`Bridge DROP (filtered) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
            }
          } catch (err) {
            logger.warn("Bridge send error:", err as any);
          }
        });
      }

      logger.info(`MidiBridge: '${this.toPort}' ⇄ '${this.fromPort}' actif.`);
    } catch (err) {
      if (!this.optional) throw err;
      logger.warn("MidiBridge init (optional) ignoré:", err as any);
    }
  }

  async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {}

  async shutdown(): Promise<void> {
    try { this.inFromTarget?.closePort(); } catch {}
    try { this.outToTarget?.closePort(); } catch {}
    this.inFromTarget = null;
    this.outToTarget = null;
    this.unsubXTouch?.();
    this.unsubXTouch = undefined;
    logger.info("MidiBridge arrêté.");
  }

  // Note: transformations déplacées vers src/midi/transform.ts
}
