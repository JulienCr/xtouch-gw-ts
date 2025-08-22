import { Input, Output } from "@julusian/midi";
import { logger } from "../../logger";
import { findPortIndexByNameFragment } from "../../midi/ports";
import { human, hex } from "../../midi/utils";
import { resolveAppKeyFromPort } from "../../shared/appKey";

type TimerHandle = { count: number; timer: NodeJS.Timeout };

export type ReconnectDeps = {
  toPort: string;
  fromPort: string;
  optional: boolean;
  getOut(): Output | null;
  setOut(o: Output | null): void;
  getIn(): Input | null;
  setIn(i: Input | null): void;
  onFeedbackFromApp?: (appKey: string, raw: number[], portId: string) => void;
};

export class ReconnectHelper {
  private outRetry: TimerHandle | null = null;
  private inRetry: TimerHandle | null = null;

  constructor(private readonly d: ReconnectDeps) {}

  tryOpenOutOnce(): void {
    try {
      const out = new Output();
      const outIdx = findPortIndexByNameFragment(out, this.d.toPort);
      if (outIdx == null) {
        out.closePort?.();
        if (this.d.optional) {
          logger.warn(`MidiBridge: port OUT introuvable '${this.d.toPort}' (optional).`);
          this.scheduleOutRetry();
          return;
        }
        throw new Error(`Port OUT introuvable pour '${this.d.toPort}'`);
      }
      out.openPort(outIdx);
      this.d.setOut(out);
      // succès → annuler retry
      if (this.outRetry) { try { clearTimeout(this.outRetry.timer); } catch {} this.outRetry = null; }
      logger.info(`MidiBridge: OUT ouvert '${this.d.toPort}'.`);
    } catch (err) {
      if (!this.d.optional) throw err as any;
      logger.warn(`MidiBridge: ouverture OUT échouée '${this.d.toPort}':`, err as any);
      this.scheduleOutRetry();
    }
  }

  tryOpenInOnce(): void {
    try {
      const inp = new Input();
      const inIdx = findPortIndexByNameFragment(inp, this.d.fromPort);
      if (inIdx == null) {
        inp.closePort?.();
        if (this.d.optional) {
          logger.warn(`MidiBridge: port IN introuvable '${this.d.fromPort}' (optional).`);
          this.scheduleInRetry();
          return;
        }
        throw new Error(`Port IN introuvable pour '${this.d.fromPort}'`);
      }
      inp.ignoreTypes(false, false, false);
      inp.on("message", (_delta, data) => {
        logger.debug(`Bridge RX <- ${this.d.fromPort}: ${human(data)} [${hex(data)}]`);
        try {
          const appKey = resolveAppKeyFromPort(this.d.fromPort);
          this.d.onFeedbackFromApp?.(appKey, data, this.d.fromPort);
        } catch (err) {
          logger.warn("Bridge reverse send error:", err as any);
        }
      });
      inp.openPort(inIdx);
      this.d.setIn(inp);
      if (this.inRetry) { try { clearTimeout(this.inRetry.timer); } catch {} this.inRetry = null; }
      logger.info(`MidiBridge: IN ouvert '${this.d.fromPort}'.`);
    } catch (err) {
      if (!this.d.optional) throw err as any;
      logger.warn(`MidiBridge: ouverture IN échouée '${this.d.fromPort}':`, err as any);
      this.scheduleInRetry();
    }
  }

  sendSafe(bytes: number[]): void {
    let out = this.d.getOut();
    if (!out) {
      this.tryOpenOutOnce();
      out = this.d.getOut();
      if (!out) return;
    }
    try {
      out.sendMessage(bytes);
    } catch (err) {
      logger.warn(`MidiBridge: envoi OUT échoué '${this.d.toPort}', reconnexion planifiée...`, err as any);
      try { out.closePort(); } catch {}
      this.d.setOut(null);
      this.scheduleOutRetry();
    }
  }

  shutdown(): void {
    if (this.outRetry) { try { clearTimeout(this.outRetry.timer); } catch {} this.outRetry = null; }
    if (this.inRetry) { try { clearTimeout(this.inRetry.timer); } catch {} this.inRetry = null; }
  }

  private scheduleOutRetry(): void {
    const nextCount = ((this.outRetry?.count ?? 0) + 1);
    if (this.outRetry) { try { clearTimeout(this.outRetry.timer); } catch {} }
    const delay = Math.min(10_000, 250 * nextCount);
    const timer = setTimeout(() => this.tryOpenOutOnce(), delay);
    this.outRetry = { count: nextCount, timer };
    try { logger.info(`MidiBridge: RETRY OUT ${nextCount} '${this.d.toPort}' dans ${delay}ms.`); } catch {}
  }

  private scheduleInRetry(): void {
    const nextCount = ((this.inRetry?.count ?? 0) + 1);
    if (this.inRetry) { try { clearTimeout(this.inRetry.timer); } catch {} }
    const delay = Math.min(10_000, 250 * nextCount);
    const timer = setTimeout(() => this.tryOpenInOnce(), delay);
    this.inRetry = { count: nextCount, timer };
    try { logger.info(`MidiBridge: RETRY IN ${nextCount} '${this.d.fromPort}' dans ${delay}ms.`); } catch {}
  }
}


