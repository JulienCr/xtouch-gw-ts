import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";
import type { XTouchDriver } from "../xtouch/driver";
import type { MidiFilterConfig, TransformConfig } from "../config";
import { hex, human } from "../midi/utils";
import { matchFilter } from "../midi/filter";
import { applyTransform } from "../midi/transform";
import { findPortIndexByNameFragment } from "../midi/ports";

// findPortIndexByNameFragment désormais importé depuis src/midi/ports.ts


export class MidiBridgeDriver implements Driver {
  readonly name = "midi-bridge";
  private outToTarget: Output | null = null;
  private inFromTarget: Input | null = null;
  private unsubXTouch?: () => void;
  // Debounce pour setpoint moteurs: éviter de renvoyer PB pendant le mouvement → ne fixer qu'à l'arrêt
  private faderSetpointTimers: Map<number, NodeJS.Timeout> = new Map();
  private lastPbValue14: Map<number, number> = new Map();

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
            // Déterminer l'app key selon le port
            const appKey = this.resolveAppKeyFromPort(this.fromPort);
            
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
            const typeNibble = (status & 0xf0) >> 4;
            const isPB = typeNibble === 0xE;
            if (isPB && (this.xtouch as any).isPitchBendSquelched?.()) {
              logger.debug(`Bridge DROP (PB squelched) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
              return;
            }
            try { (global as any).__router__?.markUserActionFromRaw?.(data); } catch {}
            if (matchFilter(data, this.filter)) {
               const tx = applyTransform(data, this.transform);
              if (!tx) {
                logger.debug(`Bridge DROP (transformed to null) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
                return;
              }
              logger.debug(`Bridge TX -> ${this.toPort}: ${human(tx)} [${hex(tx)}]`);
              this.outToTarget?.sendMessage(tx);
              // Programmer un setpoint moteur APRÈS une courte inactivité pour TOUT PB (QLC pb_to_cc ou VM PB natif)
              try {
                if (typeNibble === 0xE) {
                  const ch1 = (status & 0x0f) + 1;
                  const lsb = data[1] ?? 0;
                  const msb = data[2] ?? 0;
                  const value14 = ((msb & 0x7f) << 7) | (lsb & 0x7f);
                  this.lastPbValue14.set(ch1, value14);
                  const prev = this.faderSetpointTimers.get(ch1);
                  if (prev) {
                    try { clearTimeout(prev); } catch {}
                  }
                  const t = setTimeout(() => {
                    const v = this.lastPbValue14.get(ch1);
                    if (v != null) {
                      try {
                        logger.trace(`Setpoint PB -> X-Touch: ch=${ch1} val14=${v}`);
                        this.xtouch.setFader14(ch1, v);
                      } catch {}
                    }
                    this.faderSetpointTimers.delete(ch1);
                  }, 90);
                  this.faderSetpointTimers.set(ch1, t);
                }
              } catch {}
              // Marquer shadow app pour anti-echo côté router (exposé globalement par app.ts)
              try { (global as any).__router__?.markAppShadowForOutgoing?.(this.resolveAppKeyFromPort(this.toPort), tx, this.toPort); } catch {}
              // Note: On ne met pas à jour le state avec les commandes sortantes
              // Le state ne doit être mis à jour QUE par les feedbacks entrants
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

  /**
   * Résout l'app key selon le nom du port
   */
  private resolveAppKeyFromPort(port: string): string {
    const portLower = port.toLowerCase();
    if (portLower.includes("qlc")) return "qlc";
    if (portLower.includes("xtouch-gw") || portLower.includes("voicemeeter")) return "voicemeeter";
    if (portLower.includes("obs")) return "obs";
    return "midi-bridge";
  }

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
