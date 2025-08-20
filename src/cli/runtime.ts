import { logger } from "../logger";
import { MidiInputSniffer } from "../midi/sniffer";

/**
 * Create (or reuse) a singleton sniffer instance for the CLI session.
 */
export function createMidiSniffer(onEvent: (evt: Parameters<ConstructorParameters<typeof MidiInputSniffer>[0]>[0]) => void): MidiInputSniffer {
  const sniffer = new MidiInputSniffer(onEvent);
  return sniffer;
}

export function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * Clear console including scrollback where supported.
 */
export function clearConsole(): void {
  try {
    process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
  } catch (err) {
    logger.debug("clearConsole failed", err as any);
  }
}


