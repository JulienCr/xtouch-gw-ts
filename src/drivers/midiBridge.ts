import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";
import type { XTouchDriver } from "../xtouch/driver";
import type { MidiFilterConfig, TransformConfig } from "../config";
import { hex, human, isPB, pb14FromRaw } from "../midi/utils";
import { scheduleFaderSetpoint } from "../xtouch/faderSetpoint";
import { matchFilter } from "../midi/filter";
import { applyTransform } from "../midi/transform";
import { findPortIndexByNameFragment } from "../midi/ports";
import { resolveAppKeyFromPort } from "../shared/appKey";
import { markAppOutgoingAndForward } from "../midi/appClient"; // MODIF: dédup shadow/forward

// MODIF: typage sûr pour accès au squelch PB
type PitchBendSquelchCapable = { isPitchBendSquelched?: () => boolean };

export class MidiBridgeDriver implements Driver {
  readonly name = "midi-bridge";
  private outToTarget: Output | null = null;
  private inFromTarget: Input | null = null;
  private unsubXTouch?: () => void;
  // MODIF: timers/état de setpoint supprimés (mutualisés via scheduleFaderSetpoint)

  constructor(
    private readonly xtouch: XTouchDriver,
    private readonly toPort: string,
    private readonly fromPort: string,
    private readonly filter?: MidiFilterConfig,
    private readonly transform?: TransformConfig,
    private readonly optional: boolean = true,
    private readonly onFeedbackFromApp?: (appKey: string, raw: number[], portId: string) => void
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
            // Déterminer l'app key selon le port (mutualisé)
            const appKey = resolveAppKeyFromPort(this.fromPort);
            
            // Mettre à jour le state avec le feedback original
            try {
              this.onFeedbackFromApp?.(appKey, data, this.fromPort);
            } catch {}
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
            // Bloquer temporairement l'émission des PB du X‑Touch vers la cible pendant squelch
            const status = data[0] ?? 0;
            const isPBMsg = isPB(status);
            const squelched = (this.xtouch as unknown as PitchBendSquelchCapable).isPitchBendSquelched?.() === true;
            if (isPBMsg && squelched) {
              logger.trace(`Bridge DROP (PB squelched) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
              return;
            }
            try { (global as any).__router__?.markUserActionFromRaw?.(data); } catch {}
            if (matchFilter(data, this.filter)) {
               const tx = applyTransform(data, this.transform);
              if (!tx) {
                logger.trace(`Bridge DROP (transformed to null) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
                return;
              }
              logger.debug(`Bridge TX -> ${this.toPort}: ${human(tx)} [${hex(tx)}]`);
              this.outToTarget?.sendMessage(tx);
              // Programmer un setpoint moteur APRÈS une courte inactivité pour TOUT PB (QLC pb_to_cc ou VM PB natif)
              try {
                if (isPBMsg) {
                  const ch1 = (status & 0x0f) + 1;
                  const lsb = data[1] ?? 0;
                  const msb = data[2] ?? 0;
                  const value14 = pb14FromRaw(lsb, msb);
                  scheduleFaderSetpoint(this.xtouch, ch1, value14);
                }
              } catch {}
              // Marquer shadow app pour anti-echo côté router (exposé globalement par app.ts)
              // MODIF: délégué au helper commun (shadow + forward → Router)
              try { markAppOutgoingAndForward(resolveAppKeyFromPort(this.toPort), tx, this.toPort); } catch {}
              // Note: On ne met pas à jour le state avec les commandes sortantes
              // Le state ne doit être mis à jour QUE par les feedbacks entrants
            } else {
              logger.trace(`Bridge DROP (filtered) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
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
    try { this.unsubXTouch?.(); } catch {}
    this.unsubXTouch = undefined;
    logger.info("MidiBridge arrêté.");
  }
}
