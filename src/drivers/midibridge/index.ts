import { logger } from "../../logger";
import type { Driver, ExecutionContext } from "../../types";
import type { XTouchDriver } from "../../xtouch/driver";
import type { MidiFilterConfig, TransformConfig } from "../../config";
import { hex, human, isPB, pb14FromRaw } from "../../midi/utils";
import { matchFilter } from "../../midi/filter";
import { applyTransform } from "../../midi/transform";
import { resolveAppKeyFromPort } from "../../shared/appKey";
import { scheduleFaderSetpoint } from "../../xtouch/faderSetpoint";
import { ReconnectHelper } from "./reconnect";
import { sendControlMidi } from "../../services/controlMidiSender"; // MODIF: délégation OUT vers orchestrateur

// Typage sûr pour accès au squelch PB
type PitchBendSquelchCapable = { isPitchBendSquelched?: () => boolean };

export class MidiBridgeDriver implements Driver {
  readonly name = "midi-bridge";
  private outToTarget: import("@julusian/midi").Output | null = null;
  private inFromTarget: import("@julusian/midi").Input | null = null;
  private unsubXTouch?: () => void;
  private readonly reconn: ReconnectHelper;

  constructor(
    private readonly xtouch: XTouchDriver,
    private readonly toPort: string,
    private readonly fromPort: string,
    private readonly filter?: MidiFilterConfig,
    private readonly transform?: TransformConfig,
    private readonly optional: boolean = true,
    private readonly onFeedbackFromApp?: (appKey: string, raw: number[], portId: string) => void
  ) {
    this.reconn = new ReconnectHelper({
      toPort: this.toPort,
      fromPort: this.fromPort,
      optional: this.optional,
      getOut: () => this.outToTarget,
      setOut: (o) => { this.outToTarget = o; },
      getIn: () => this.inFromTarget,
      setIn: (i) => { this.inFromTarget = i; },
      onFeedbackFromApp: this.onFeedbackFromApp,
    });
  }

  async init(): Promise<void> {
    try {
      // MODIF: OUT délégué à l'orchestrateur (MidiAppClient via ControlMidiSender)
      this.reconn.tryOpenInOnce();

      this.unsubXTouch = this.xtouch.subscribe((_delta, data) => {
        try {
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
            // MODIF: délèguer l'envoi OUT à l'orchestrateur (passthrough bytes)
            const app = resolveAppKeyFromPort(this.toPort);
            sendControlMidi(app, { type: "passthrough", channel: 1 }, tx).catch(() => {});
            try {
              if (isPBMsg) {
                const ch1 = (status & 0x0f) + 1;
                const lsb = data[1] ?? 0;
                const msb = data[2] ?? 0;
                const value14 = pb14FromRaw(lsb, msb);
                scheduleFaderSetpoint(this.xtouch, ch1, value14);
              }
            } catch {}
            // Forwarding to Router is handled by ControlMidiSender hooks
          } else {
            logger.trace(`Bridge DROP (filtered) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
          }
        } catch (err) {
          logger.warn("Bridge send error:", err as any);
        }
      });

      logger.info(`MidiBridge: '${this.toPort}' ⇄ '${this.fromPort}' actif.`);
    } catch (err) {
      if (!this.optional) throw err;
      logger.warn("MidiBridge init (optional) ignoré:", err as any);
    }
  }

  async execute(_action: string, _params: unknown[], _context?: ExecutionContext): Promise<void> {}

  async shutdown(): Promise<void> {
    try { this.inFromTarget?.closePort(); } catch {}
    try { this.outToTarget?.closePort(); } catch {}
    this.inFromTarget = null;
    this.outToTarget = null;
    try { this.unsubXTouch?.(); } catch {}
    this.unsubXTouch = undefined;
    this.reconn.shutdown();
    logger.info("MidiBridge arrêté.");
  }
}

