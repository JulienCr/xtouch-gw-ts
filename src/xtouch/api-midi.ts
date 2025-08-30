import { rawFromPb14 } from "../midi/bytes"; // MODIF: centraliser via bytes.ts
import { clamp } from "../midi/appClient/core";

export type RawSender = { sendRawMessage(bytes: number[]): void };

export function sendNoteOn(driver: RawSender, channel: number, note: number, velocity: number): void {
  const ch = clamp(channel, 1, 16);
  const n = clamp(note, 0, 127);
  const v = clamp(velocity, 0, 127);
  driver.sendRawMessage([0x90 + (ch - 1), n, v]);
}

function sendNoteOff(driver: RawSender, channel: number, note: number): void {
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
  clearLcds?: boolean;
}): Promise<void> {
  const ch = options?.buttonsChannel ?? 1;
  const first = options?.firstNote ?? 0;
  const last = options?.lastNote ?? 101;
  const dly = options?.interMessageDelayMs ?? 2;
  const faders = options?.faderChannels ?? [1,2,3,4,5,6,7,8,9];
  await setAllButtonsVelocity(driver, ch, first, last, 0, dly);
  await resetFadersToZero(driver, faders);
  if (options?.clearLcds) {
    try {
      const { clearAllLcds } = await import("./api-lcd");
      await clearAllLcds(driver, { stripCount: 8, clearSevenSeg: true });
    } catch {}
  }
}

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

