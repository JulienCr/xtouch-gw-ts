import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";
import type { XTouchDriver } from "../xtouch/driver";

function findPortIndexByNameFragment<T extends Input | Output>(
  device: T,
  nameFragment: string
): number | null {
  const needle = nameFragment.trim().toLowerCase();
  const count = device.getPortCount();
  for (let i = 0; i < count; i += 1) {
    const name = device.getPortName(i) ?? "";
    if (name.toLowerCase().includes(needle)) return i;
  }
  return null;
}

export class MidiBridgeDriver implements Driver {
  readonly name = "midi-bridge";
  private outToTarget: Output | null = null;
  private inFromTarget: Input | null = null;
  private unsubXTouch?: () => void;

  constructor(private readonly xtouch: XTouchDriver, private readonly toPort: string, private readonly fromPort: string) {}

  async init(): Promise<void> {
    const out = new Output();
    const outIdx = findPortIndexByNameFragment(out, this.toPort);
    if (outIdx == null) throw new Error(`Port OUT introuvable pour '${this.toPort}'`);
    out.openPort(outIdx);
    this.outToTarget = out;

    const inp = new Input();
    const inIdx = findPortIndexByNameFragment(inp, this.fromPort);
    if (inIdx == null) throw new Error(`Port IN introuvable pour '${this.fromPort}'`);
    inp.ignoreTypes(false, false, false);
    inp.on("message", (_delta, data) => this.xtouch.sendRawMessage(data));
    inp.openPort(inIdx);
    this.inFromTarget = inp;

    this.unsubXTouch = this.xtouch.subscribe((_delta, data) => {
      try { this.outToTarget?.sendMessage(data); } catch (err) { logger.warn("Bridge send error:", err as any); }
    });

    logger.info(`MidiBridge: '${this.toPort}' ⇄ '${this.fromPort}' actif.`);
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
}
