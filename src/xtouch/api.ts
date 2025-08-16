import { rawFromPb14 } from "../midi/utils";
import { centerToLength, sevenSegForChar } from "./seg7";

export type RawSender = { sendRawMessage(bytes: number[]): void };

export function sendNoteOn(driver: RawSender, channel: number, note: number, velocity: number): void {
  const ch = clamp(channel, 1, 16);
  const n = clamp(note, 0, 127);
  const v = clamp(velocity, 0, 127);
  driver.sendRawMessage([0x90 + (ch - 1), n, v]);
}

export function sendNoteOff(driver: RawSender, channel: number, note: number): void {
  sendNoteOn(driver, channel, note, 0);
}

export function sendControlChange(driver: RawSender, channel: number, controller: number, value: number): void {
  const ch = clamp(channel, 1, 16);
  const cc = clamp(controller, 0, 127);
  const v = clamp(value, 0, 127);
  driver.sendRawMessage([0xB0 + (ch - 1), cc, v]);
}

export function sendPitchBend14(driver: RawSender, channel: number, value14: number): void {
  const v = clamp(value14 | 0, 0, 16383);
  const bytes = rawFromPb14(channel, v);
  driver.sendRawMessage(bytes);
}

export async function setAllButtonsVelocity(
  driver: RawSender,
  channel = 1,
  firstNote = 0,
  lastNote = 101,
  velocity = 0,
  interMessageDelayMs = 2,
): Promise<void> {
  for (let note = firstNote; note <= lastNote; note++) {
    sendNoteOn(driver, channel, note, velocity);
    if (interMessageDelayMs > 0) await delay(interMessageDelayMs);
  }
}

export async function resetFadersToZero(driver: RawSender, channels: number[] = [1,2,3,4,5,6,7,8,9]): Promise<void> {
  for (const ch of channels) sendPitchBend14(driver, ch, 0);
}

export async function resetAll(driver: RawSender, options?: {
  buttonsChannel?: number;
  firstNote?: number;
  lastNote?: number;
  interMessageDelayMs?: number;
  faderChannels?: number[];
}): Promise<void> {
  const ch = options?.buttonsChannel ?? 1;
  const first = options?.firstNote ?? 0;
  const last = options?.lastNote ?? 101;
  const dly = options?.interMessageDelayMs ?? 2;
  const faders = options?.faderChannels ?? [1,2,3,4,5,6,7,8,9];
  await setAllButtonsVelocity(driver, ch, first, last, 0, dly);
  await resetFadersToZero(driver, faders);
}

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }

// LCD helpers (MCU)

function ascii7(text: string, length = 7): number[] {
  const padded = (text ?? "").padEnd(length).slice(0, length);
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 1) {
    const code = padded.charCodeAt(i);
    bytes.push(code >= 0x20 && code <= 0x7e ? code : 0x20);
  }
  return bytes;
}

/** Écrit du texte sur un strip LCD (ligne haute et basse). */
export function sendLcdStripText(driver: RawSender, stripIndex0to7: number, upper: string, lower = ""): void {
  const strip = Math.max(0, Math.min(7, Math.floor(stripIndex0to7)));
  const up = ascii7(upper, 7);
  const lo = ascii7(lower, 7);
  const header = [0xF0, 0x00, 0x00, 0x66, 0x14, 0x12];
  const posTop = 0x00 + strip * 7;
  const posBot = 0x38 + strip * 7;
  driver.sendRawMessage([...header, posTop, ...up, 0xF7]);
  driver.sendRawMessage([...header, posBot, ...lo, 0xF7]);
}

/** Définis les couleurs des 8 LCD (firmware >= 1.22). */
export function setLcdColors(driver: RawSender, colors: number[]): void {
  const payload = colors.slice(0, 8);
  while (payload.length < 8) payload.push(0);
  driver.sendRawMessage([0xF0, 0x00, 0x00, 0x66, 0x14, 0x72, ...payload, 0xF7]);
}

/** Met à jour l’afficheur 7-segments (timecode) avec centrage et points optionnels. */
export function setSevenSegmentText(
  driver: RawSender,
  text: string,
  options?: { deviceId?: number; dots1?: number; dots2?: number }
): void {
  const dots1 = (options?.dots1 ?? 0x00) & 0x7F;
  const dots2 = (options?.dots2 ?? 0x00) & 0x7F;
  const normalized = (text ?? "").toString();
  const centered = centerToLength(normalized, 12);
  const chars = centered.slice(0, 12).split("");
  const segs = chars.map((c) => sevenSegForChar(c));
  const deviceIds = options?.deviceId != null ? [options.deviceId & 0x7F] : [0x14, 0x15];
  for (const dd of deviceIds) {
    const msg: number[] = [0xF0, 0x00, 0x20, 0x32, dd, 0x37, ...segs, dots1, dots2, 0xF7];
    driver.sendRawMessage(msg);
  }
}


