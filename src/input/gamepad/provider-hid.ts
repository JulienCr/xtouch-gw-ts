import { logger } from "../../logger";
import type { GamepadEvent, GamepadProvider } from "./provider-xinput";

declare const process: any;

export interface HidProviderOptions {
  productMatch?: string; // substring match on product/manufacturer
  vendorId?: number;
  productId?: number;
  path?: string; // explicit HID path
  mappingCsvPath?: string; // docs/gamepad-hid-mapping.csv
}

type ButtonMapping = { id: string; byte: number; mask: number; rid?: number };
type AxisMapping = {
  id: string;
  kind: "u8" | "s8" | "u16le" | "s16le" | "u16be" | "s16be";
  byte: number; // start index (lo for *le)
  hi?: number; // for 16-bit
  min?: number; // optional calibration
  max?: number;
  center?: number; // for pm1 normalization
  normalize?: "n01" | "pm1"; // default n01
  rid?: number; // optional HID report id to match (buf[0])
};

function parseCsv(path: string): { buttons: ButtonMapping[]; axes: AxisMapping[] } {
  const fs = require("fs");
  let txt = "";
  try { txt = fs.readFileSync(path, "utf8"); } catch { return { buttons: [], axes: [] }; }
  const lines = txt.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith("#"));
  const header = (lines.shift() || "").split(",").map((s) => s.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const buttons: ButtonMapping[] = [];
  const axes: AxisMapping[] = [];
  for (const line of lines) {
    const cells = line.split(",").map((s) => s.trim());
    const id = cells[idx("id")] ?? cells[0];
    const type = (cells[idx("type")] ?? "").toLowerCase();
    if (!id || !type) continue;
    if (type === "bit") {
      const byte = Number(cells[idx("byte")] ?? -1);
      const maskStr = String(cells[idx("mask")] ?? "0");
      const mask = maskStr.startsWith("0x") ? parseInt(maskStr, 16) : Number(maskStr);
      const rid = Number(cells[idx("rid")] ?? NaN);
      if (Number.isFinite(byte) && Number.isFinite(mask)) buttons.push({ id, byte: byte | 0, mask: (mask | 0) & 0xff, rid: Number.isFinite(rid) ? (rid | 0) : undefined });
    } else {
      const kind = type as AxisMapping["kind"];
      const byte = Number(cells[idx("byte")] ?? -1) | 0;
      const hi = Number(cells[idx("hi")] ?? -1) | 0;
      const min = Number(cells[idx("min")] ?? NaN);
      const max = Number(cells[idx("max")] ?? NaN);
      const center = Number(cells[idx("center")] ?? NaN);
      const normalize = (cells[idx("normalize")] ?? "n01") as AxisMapping["normalize"];
      const rid = Number(cells[idx("rid")] ?? NaN);
      axes.push({ id, kind, byte, hi: Number.isFinite(hi) && hi >= 0 ? hi : undefined, min: Number.isFinite(min) ? min : undefined, max: Number.isFinite(max) ? max : undefined, center: Number.isFinite(center) ? center : undefined, normalize, rid: Number.isFinite(rid) ? (rid | 0) : undefined });
    }
  }
  return { buttons, axes };
}

function readU(buf: Buffer, kind: AxisMapping["kind"], i: number, hi?: number): number {
  switch (kind) {
    case "u8": return buf[i];
    case "s8": return (buf[i] << 24) >> 24;
    case "u16le": return (buf[i] | ((buf[hi ?? (i + 1)] ?? 0) << 8)) >>> 0;
    case "s16le": return (buf[i] | ((buf[hi ?? (i + 1)] ?? 0) << 8)) << 16 >> 16;
    case "u16be": return (((buf[i] ?? 0) << 8) | (buf[hi ?? (i + 1)] ?? 0)) >>> 0;
    case "s16be": return (((buf[i] ?? 0) << 8) | (buf[hi ?? (i + 1)] ?? 0)) << 16 >> 16;
  }
}

function normalize(value: number, m: AxisMapping): number {
  const kind = m.kind;
  const norm = m.normalize ?? "n01";
  if (norm === "n01") {
    const max = m.max ?? (kind.startsWith("u16") ? 65535 : kind.startsWith("s") ? 127 : 255);
    const min = m.min ?? 0;
    const v = Math.max(min, Math.min(max, value));
    return (v - min) / (max - min || 1);
  }
  // pm1
  const center = m.center ?? (kind.startsWith("u16") ? 32768 : 128);
  const span = Math.max(
    Math.abs((m.max ?? (kind.startsWith("u16") ? 65535 : 255)) - center),
    Math.abs(center - (m.min ?? 0))
  ) || 1;
  const v = (value - center) / span;
  return Math.max(-1, Math.min(1, v));
}

export async function startHidProvider(opts: HidProviderOptions): Promise<GamepadProvider> {
  const HID = require("node-hid");
  const devices = HID.devices();
  let picked: any = null;
  // Selection strategy
  if (opts?.path) picked = devices.find((d: any) => d.path === opts.path) || null;
  if (!picked && opts?.vendorId && opts?.productId) picked = devices.find((d: any) => d.vendorId === opts.vendorId && d.productId === opts.productId) || null;
  if (!picked && opts?.productMatch) {
    const needle = String(opts.productMatch).toLowerCase();
    picked = devices.find((d: any) => String(d.product || "").toLowerCase().includes(needle) || String(d.manufacturer || "").toLowerCase().includes(needle)) || null;
  }
  if (!picked) picked = devices.find((d: any) => /controller|gamepad|nintendo|xbox|switch/i.test(String(d.product || ""))) || devices[0] || null;
  if (!picked) {
    logger.warn("Gamepad(HID): aucun périphérique HID compatible trouvé.");
    throw new Error("No HID gamepad found");
  }
  try { logger.info(`Gamepad(HID): using device vendor=${picked.vendorId} product=${picked.productId} product='${picked.product}' path='${picked.path}'`); } catch {}

  let device: any;
  try { device = new HID.HID(picked.path); } catch (err) { logger.warn("Gamepad(HID): ouverture du device a échoué", err as any); throw err; }
  try { device.setNonBlocking?.(true); } catch {}

  const mappingPath = opts?.mappingCsvPath || "";
  const { buttons, axes } = mappingPath ? parseCsv(mappingPath) : { buttons: [], axes: [] };
  try { logger.info(`Gamepad(HID): mapping loaded buttons=${buttons.length} axes=${axes.length} from '${mappingPath || "(none)"}'`); } catch {}
  let debugRawLeft = 10;
  if ((buttons.length + axes.length) === 0) {
    logger.warn("Gamepad(HID): aucun mapping CSV chargé. Utilisez le script de calibration pour générer docs/gamepad-hid-mapping.csv");
    logger.warn("Gamepad(HID): dump temporaire de quelques rapports pour aider au mapping…");
  }

  const listeners = new Set<(ev: GamepadEvent) => void>();
  const notify = (ev: GamepadEvent) => { for (const cb of listeners) { try { cb(ev); } catch {} } };

  const lastBtn = new Map<string, boolean>();
  const lastAxis = new Map<string, number>();

  const processBuf = (buf: Buffer): void => {
    try {
      if (debugRawLeft > 0) {
        debugRawLeft--;
        try {
          const hex = Array.prototype.map.call(buf, (b: number) => (b as number).toString(16).padStart(2, "0")).join(" ");
          logger.trace(`HID raw[${buf.length}]: ${hex}`);
        } catch {}
      }
      for (const m of buttons) {
        if (m.rid != null && (buf[0] & 0xff) !== (m.rid & 0xff)) continue;
        const pressed = ((buf[m.byte] ?? 0) & m.mask) !== 0;
        const prev = lastBtn.get(m.id);
        if (prev === undefined || prev !== pressed) { lastBtn.set(m.id, pressed); notify({ id: m.id, type: "button", pressed }); }
      }
      for (const m of axes) {
        if (m.rid != null && (buf[0] & 0xff) !== (m.rid & 0xff)) continue;
        const raw = readU(buf, m.kind, m.byte, m.hi);
        const val = normalize(raw, m);
        const prev = lastAxis.get(m.id);
        if (prev === undefined || Math.abs(prev - val) >= 0.003) { lastAxis.set(m.id, val); notify({ id: m.id, type: "axis", value: val }); }
      }
    } catch (err) { logger.debug("Gamepad(HID): parse error", err as any); }
  };

  // Prefer native 'data' event for lowest latency; fallback to polling if it errors on this driver
  let pollTimer: any = null;
  const startPolling = () => {
    try { if (pollTimer) clearInterval(pollTimer); } catch {}
    pollTimer = setInterval(() => {
      try {
        if (typeof (device as any).readTimeout === "function") {
          const arr = (device as any).readTimeout(0);
          if (Array.isArray(arr) && arr.length > 0) processBuf(Buffer.from(arr));
        }
      } catch {}
    }, 4);
    try { device.removeAllListeners?.("data"); } catch {}
    logger.info("Gamepad(HID): polling loop started (4ms)");
  };

  try {
    device.on("data", (buf: Buffer) => processBuf(buf));
    device.on("error", (_: any) => startPolling());
  } catch {
    startPolling();
  }

  return {
    subscribe(cb) { listeners.add(cb); return () => { try { listeners.delete(cb); } catch {} }; },
    stop() { try { if (pollTimer) clearInterval(pollTimer); } catch {} try { device.close(); } catch {} listeners.clear(); },
  };
}
