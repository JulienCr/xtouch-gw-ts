import type { RawSender } from "./api-midi";
import { centerToLength, sevenSegForChar } from "./seg7";

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

/** Écrit uniquement la ligne basse d'un strip LCD (7 caractères). */
function sendLcdStripLowerText(driver: RawSender, stripIndex0to7: number, lower: string): void {
  const strip = Math.max(0, Math.min(7, Math.floor(stripIndex0to7)));
  const lo = ascii7(lower, 7);
  const header = [0xF0, 0x00, 0x00, 0x66, 0x14, 0x12];
  const posBot = 0x38 + strip * 7;
  driver.sendRawMessage([...header, posBot, ...lo, 0xF7]);
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

/** Efface tous les LCD (textes vides, couleurs à 0) et optionnellement le 7-seg. */
export async function clearAllLcds(
  driver: RawSender,
  options?: { stripCount?: number; clearSevenSeg?: boolean }
): Promise<void> {
  const n = Math.max(1, Math.min(8, Math.floor(options?.stripCount ?? 8)));
  for (let i = 0; i < n; i++) {
    sendLcdStripText(driver, i, "", "");
  }
  const zeros: number[] = new Array(8).fill(0);
  setLcdColors(driver, zeros);
  if (options?.clearSevenSeg) {
    try { setSevenSegmentText(driver, ""); } catch {}
  }
}

