import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import { decodeMidi, PitchBendEvent } from "../midi/decoder";
import { findPortIndexByNameFragment } from "../midi/ports";

export interface XTouchPortsConfig {
  inputName: string; // sous-chaîne à chercher
  outputName: string; // sous-chaîne à chercher
}

export interface XTouchOptions {
  echoPitchBend?: boolean; // écho local pour stabiliser les faders quand aucun feedback externe
  echoButtonsAndEncoders?: boolean; // écho local Note/CC pour LED/encoders immédiats
}

type MessageHandler = (deltaSeconds: number, data: number[]) => void;


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
  private suppressPitchBendUntilMs = 0;

  constructor(private readonly ports: XTouchPortsConfig, options?: XTouchOptions) {
    this.options = {
      echoPitchBend: options?.echoPitchBend ?? true,
      echoButtonsAndEncoders: options?.echoButtonsAndEncoders ?? true,
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
      const now = Date.now();
      const status = data[0] ?? 0;
      const typeNibble = (status & 0xf0) >> 4;
      const isPitchBend = typeNibble === 0xE;

      // Squelch des PB entrants (mouvements moteurs) pendant une petite fenêtre
      if (!(isPitchBend && now < this.suppressPitchBendUntilMs)) {
        for (const h of this.handlers) {
          try {
            h(deltaSeconds, data);
          } catch (err) {
            logger.warn("X-Touch handler error:", err as any);
          }
        }
      }

      // Écho PitchBend local si activé (désactivé par défaut via app.ts pour éviter conflit feedback)
      if (this.options.echoPitchBend) {
        const decoded = decodeMidi(data);
        if (decoded.type === "pitchBend") {
          const pb = decoded as PitchBendEvent;
          if (pb.channel) {
            this.setFader14(pb.channel, pb.value14);
          }
        }
      }

      // Écho Note/CC local pour retour LED/anneaux immédiat
      if (this.options.echoButtonsAndEncoders) {
        const status2 = data[0] ?? 0;
        const typeNibble2 = (status2 & 0xf0) >> 4;
        if (typeNibble2 === 0xB) {
          // CC: écho tel quel (anneaux/encoders)
          try { this.output?.sendMessage(data); } catch {}
        } else if (typeNibble2 === 0x9 || typeNibble2 === 0x8) {
          // Notes: n'écho que les press (NoteOn vel>0). Ne pas écho les releases pour éviter le clignotement.
          const vel = data[2] ?? 0;
          const isPress = typeNibble2 === 0x9 && vel > 0;
          if (isPress) {
            try { this.output?.sendMessage(data); } catch {}
          }
        }
      }
    });
    inp.openPort(inIdx);
    this.input = inp;
    logger.info(`X-Touch INPUT connecté sur '${inp.getPortName(inIdx)}' (#${inIdx}).`);
  }

  /**
   * Ignore les PitchBend entrants pendant `ms` millisecondes (anti-boucle moteurs → QLC).
   */
  squelchPitchBend(ms: number): void {
    this.suppressPitchBendUntilMs = Math.max(this.suppressPitchBendUntilMs, Date.now() + Math.max(0, ms));
  }

  isPitchBendSquelched(): boolean {
    return Date.now() < this.suppressPitchBendUntilMs;
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

  /**
   * Met à jour le grand afficheur 7-segments (zone timecode) via trame vendor Behringer.
   *
   * Format: F0 00 20 32 dd 37 s1..s12 d1 d2 F7
   * - dd: device id (X‑Touch 0x14, Extender 0x15)
   * - s1..s12: masques 7-segments (bit0=a … bit6=g) pour chaque digit
   * - d1: dots digits 1..7 (bit0 => digit1, …, bit6 => digit7)
   * - d2: dots digits 8..12 (bit0 => digit8, …, bit4 => digit12)
   *
   * Affiche le texte centré/tronqué à 12 caractères. Les caractères non supportés sont rendus vides.
   */
  setSevenSegmentText(text: string, options?: { deviceId?: number; dots1?: number; dots2?: number }): void {
    if (!this.output) return;
    const dots1 = (options?.dots1 ?? 0x00) & 0x7F;
    const dots2 = (options?.dots2 ?? 0x00) & 0x7F;
    const normalized = (text ?? "").toString();
    const centered = centerToLength(normalized, 12);
    const chars = centered.slice(0, 12).split("");
    const segs = chars.map((c) => sevenSegForChar(c));
    const deviceIds = options?.deviceId != null ? [options.deviceId & 0x7F] : [0x14, 0x15];
    for (const dd of deviceIds) {
      const msg: number[] = [0xF0, 0x00, 0x20, 0x32, dd, 0x37, ...segs, dots1, dots2, 0xF7];
      this.output.sendMessage(msg);
    }
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

/**
 * Encode un caractère vers son masque 7-segments (bit0=a … bit6=g).
 * Les lettres sont mappées en majuscules lorsque pertinent.
 */
function sevenSegForChar(ch: string): number {
  const c = (ch || " ").toUpperCase();
  switch (c) {
    case "0": return 0x3F;
    case "1": return 0x06;
    case "2": return 0x5B;
    case "3": return 0x4F;
    case "4": return 0x66;
    case "5": return 0x6D;
    case "6": return 0x7D;
    case "7": return 0x07;
    case "8": return 0x7F;
    case "9": return 0x6F;
    case "A": return 0x77;
    case "B": return 0x7C; // 'b'
    case "C": return 0x39;
    case "D": return 0x5E; // 'd'
    case "E": return 0x79;
    case "F": return 0x71;
    case "G": return 0x3D;
    case "H": return 0x76;
    case "I": return 0x06; // même que '1'
    case "J": return 0x1E;
    case "L": return 0x38;
    case "N": return 0x37; // approx
    case "O": return 0x3F;
    case "P": return 0x73;
    case "S": return 0x6D;
    case "T": return 0x78; // 't'
    case "U": return 0x3E;
    case "Y": return 0x6E;
    case "-": return 0x40;
    case "_": return 0x08;
    case " ": return 0x00;
    default: return 0x00;
  }
}

function centerToLength(s: string, targetLen: number): string {
  const str = s ?? "";
  if (str.length >= targetLen) return str.slice(0, targetLen);
  const totalPad = targetLen - str.length;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return " ".repeat(left) + str + " ".repeat(right);
}
