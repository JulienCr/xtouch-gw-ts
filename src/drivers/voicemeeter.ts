import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";
import { decodeMidi } from "../midi/decoder";
import type { XTouchDriver } from "../xtouch/driver";
import { findPortIndexByNameFragment } from "../midi/ports";

export interface VoicemeeterBridgeConfig {
  toVoicemeeterOutName: string; // "xtouch-gw"
  fromVoicemeeterInName: string; // "xtouch-gw-feedback"
}


export class VoicemeeterDriver implements Driver {
  readonly name = "voicemeeter";
  private outToVM: Output | null = null; // messages vers VM
  private inFromVM: Input | null = null; // feedback depuis VM
  private unsubXTouch?: () => void;

  constructor(private readonly xtouch: XTouchDriver, private readonly cfg: VoicemeeterBridgeConfig) {}

  async init(): Promise<void> {
    // Ouvrir OUT vers Voicemeeter (port nommé "xtouch-gw")
    const out = new Output();
    const outIdx = findPortIndexByNameFragment(out, this.cfg.toVoicemeeterOutName);
    if (outIdx == null) {
      out.closePort?.();
      throw new Error(`Port OUT vers Voicemeeter introuvable ('${this.cfg.toVoicemeeterOutName}')`);
    }
    out.openPort(outIdx);
    this.outToVM = out;
    logger.info(`Bridge → VM OUTPUT connecté '${out.getPortName(outIdx)}' (#${outIdx}).`);

    // Ouvrir IN depuis Voicemeeter (port nommé "xtouch-gw-feedback")
    const inp = new Input();
    const inIdx = findPortIndexByNameFragment(inp, this.cfg.fromVoicemeeterInName);
    if (inIdx == null) {
      inp.closePort?.();
      this.outToVM.closePort();
      this.outToVM = null;
      throw new Error(`Port IN depuis Voicemeeter introuvable ('${this.cfg.fromVoicemeeterInName}')`);
    }
    inp.ignoreTypes(false, false, false);
    inp.on("message", (_delta, data) => {
      // Transférer tel quel vers la surface X-Touch
      this.xtouch.sendRawMessage(data);
    });
    inp.openPort(inIdx);
    this.inFromVM = inp;
    logger.info(`Bridge ← VM INPUT connecté '${inp.getPortName(inIdx)}' (#${inIdx}).`);

    // Abonner X-Touch → Voicemeeter
    this.unsubXTouch = this.xtouch.subscribe((_delta, data) => {
      // Transférer tel quel vers VM
      try {
        this.outToVM?.sendMessage(data);
      } catch (err) {
        logger.warn("Voicemeeter bridge send error:", err as any);
      }
    });

    logger.info("VoicemeeterDriver bridge activé (X-Touch ↔ Voicemeeter).");
  }

  async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {
    // Pour l’instant, ce driver sert de bridge brut. Les actions viendront plus tard.
    // On log juste pour debug.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = decodeMidi; // éviter l’arbre secoué; future utilisation
  }

  async shutdown(): Promise<void> {
    try { this.inFromVM?.closePort(); } catch {}
    try { this.outToVM?.closePort(); } catch {}
    this.inFromVM = null;
    this.outToVM = null;
    this.unsubXTouch?.();
    this.unsubXTouch = undefined;
    logger.info("VoicemeeterDriver arrêté.");
  }
}
