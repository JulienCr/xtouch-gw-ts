import { Input } from "@julusian/midi";
import { logger } from "../logger";
import { decodeMidi, formatDecoded, DecodedMidiEvent } from "./decoder";

export interface MidiPortInfo {
  index: number;
  name: string;
}

export function listInputPorts(): MidiPortInfo[] {
  const input = new Input();
  const count = input.getPortCount();
  const ports: MidiPortInfo[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = input.getPortName(i);
    ports.push({ index: i, name });
  }
  input.closePort?.();
  return ports;
}

export type MidiMessageHandler = (message: {
  timestamp: number;
  deltaSeconds: number;
  bytes: number[];
  decoded: DecodedMidiEvent;
}) => void;

export class MidiInputSniffer {
  private input: Input | null = null;
  private lastTs = Date.now();

  constructor(private onMessage: MidiMessageHandler) {}

  openByIndex(index: number): void {
    this.close();
    const input = new Input();
    input.ignoreTypes(false, false, false);
    input.on("message", (delta: number, message: number[]) => {
      const now = Date.now();
      const decoded = decodeMidi(message);
      const evt = {
        timestamp: now,
        deltaSeconds: delta,
        bytes: message.slice(),
        decoded,
      };
      this.onMessage(evt);
      this.lastTs = now;
    });
    input.openPort(index);
    this.input = input;
    logger.info(`MIDI input ouvert: index=${index}`);
  }

  openByName(partialName: string): boolean {
    const ports = listInputPorts();
    const match = ports.find((p) => p.name.toLowerCase().includes(partialName.toLowerCase()));
    if (!match) return false;
    this.openByIndex(match.index);
    return true;
  }

  close(): void {
    if (this.input) {
      try {
        this.input.closePort();
      } catch {}
      this.input = null;
      logger.info("MIDI input fermé.");
    }
  }
}
