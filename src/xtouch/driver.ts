import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import { decodeMidi, PitchBendEvent } from "../midi/decoder";

export interface XTouchPortsConfig {
  inputName: string; // sous-chaîne à chercher
  outputName: string; // sous-chaîne à chercher
}

export interface XTouchOptions {
  echoPitchBend?: boolean; // écho local pour stabiliser les faders quand aucun feedback externe
}

type MessageHandler = (deltaSeconds: number, data: number[]) => void;

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

function ascii7(text: string, length = 7): number[] {
  const padded = (text ?? "").padEnd(length).slice(0, length);
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 1) {
    const code = padded.charCodeAt(i);
    // Conserver ASCII imprimable, sinon espace
    bytes.push(code >= 0x20 && code <= 0x7e ? code : 0x20);
  }
  return bytes;
}

export class XTouchDriver {
  private input: Input | null = null;
  private output: Output | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private readonly options: Required<XTouchOptions>;

  constructor(private readonly ports: XTouchPortsConfig, options?: XTouchOptions) {
    this.options = {
      echoPitchBend: options?.echoPitchBend ?? true,
    };
  }

  start(): void {
    // Ouvrir Output d'abord pour pouvoir envoyer du feedback immédiatement
    const out = new Output();
    const outIdx = findPortIndexByNameFragment(out, this.ports.outputName);
    if (outIdx == null) {
      out.closePort?.();
      throw new Error(
        `Port MIDI sortie introuvable pour '${this.ports.outputName}'. Vérifiez config.yaml > midi.output_port.`
      );
    }
    out.openPort(outIdx);
    this.output = out;
    logger.info(`X-Touch OUTPUT connecté sur '${out.getPortName(outIdx)}' (#${outIdx}).`);

    // Ouvrir Input et écouter
    const inp = new Input();
    const inIdx = findPortIndexByNameFragment(inp, this.ports.inputName);
    if (inIdx == null) {
      inp.closePort?.();
      this.output.closePort();
      this.output = null;
      throw new Error(
        `Port MIDI entrée introuvable pour '${this.ports.inputName}'. Vérifiez config.yaml > midi.input_port.`
      );
    }
    inp.ignoreTypes(false, false, false);
    inp.on("message", (deltaSeconds: number, data: number[]) => {
      // Notifier callbacks (bridge, sniffer, etc.)
      for (const h of this.handlers) {
        try {
          h(deltaSeconds, data);
        } catch (err) {
          logger.warn("X-Touch handler error:", err as any);
        }
      }

      // Écho PitchBend local si activé
      if (this.options.echoPitchBend) {
        const decoded = decodeMidi(data);
        if (decoded.type === "pitchBend") {
          const pb = decoded as PitchBendEvent;
          if (pb.channel) {
            this.setFader14(pb.channel, pb.value14);
          }
        }
      }
    });
    inp.openPort(inIdx);
    this.input = inp;
    logger.info(`X-Touch INPUT connecté sur '${inp.getPortName(inIdx)}' (#${inIdx}).`);
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  sendRawMessage(bytes: number[]): void {
    if (!this.output) return;
    this.output.sendMessage(bytes);
  }

  setFader14(channel1to16: number, value14: number): void {
    if (!this.output) return;
    const ch = Math.max(1, Math.min(16, channel1to16));
    const v = Math.max(0, Math.min(16383, Math.floor(value14)));
    // Pitch Bend: status E0 + channel-1, LSB, MSB
    const status = 0xE0 + (ch - 1);
    const lsb = v & 0x7F;
    const msb = (v >> 7) & 0x7F;
    this.output.sendMessage([status, lsb, msb]);
  }

  // MCU LCD text: F0 00 00 66 14 12 pos <7 bytes> F7
  sendLcdStripText(stripIndex0to7: number, upper: string, lower = ""): void {
    if (!this.output) return;
    const strip = Math.max(0, Math.min(7, Math.floor(stripIndex0to7)));
    const up = ascii7(upper, 7);
    const lo = ascii7(lower, 7);
    const header = [0xF0, 0x00, 0x00, 0x66, 0x14, 0x12];
    const posTop = 0x00 + strip * 7;
    const posBot = 0x38 + strip * 7;
    this.output.sendMessage([...header, posTop, ...up, 0xF7]);
    this.output.sendMessage([...header, posBot, ...lo, 0xF7]);
  }

  // MCU LCD colors (firmware >= 1.22): F0 00 00 66 14 72 <8 bytes colors> F7
  setLcdColors(colors: number[]): void {
    if (!this.output) return;
    const payload = colors.slice(0, 8);
    while (payload.length < 8) payload.push(0);
    this.output.sendMessage([0xF0, 0x00, 0x00, 0x66, 0x14, 0x72, ...payload, 0xF7]);
  }

  stop(): void {
    try {
      this.input?.closePort();
    } catch {}
    try {
      this.output?.closePort();
    } catch {}
    this.input = null;
    this.output = null;
    this.handlers.clear();
    logger.info("X-Touch: ports MIDI fermés.");
  }
}
