import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ButtonMapping = { id: string; byte: number; mask: number; rid?: number };
type AxisMapping = {
  id: string;
  kind: "u8" | "s8" | "u16le" | "s16le" | "u16be" | "s16be";
  byte: number;
  hi?: number;
  min?: number;
  max?: number;
  center?: number;
  normalize?: "n01" | "pm1";
  rid?: number;
};

function parseCsv(path: string): { buttons: ButtonMapping[]; axes: AxisMapping[] } {
  const fs = require("fs");
  let txt = "";
  try { txt = fs.readFileSync(path, "utf8"); } catch { return { buttons: [], axes: [] }; }
  const lines = txt.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith("#"));
  if (lines.length === 0) return { buttons: [], axes: [] };
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
  const center = m.center ?? (kind.startsWith("u16") ? 32768 : 128);
  const span = Math.max(
    Math.abs((m.max ?? (kind.startsWith("u16") ? 65535 : 255)) - center),
    Math.abs(center - (m.min ?? 0))
  ) || 1;
  const v = (value - center) / span;
  return Math.max(-1, Math.min(1, v));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "Faceoff Wired Pro Controller";
  const mappingRel = url.searchParams.get("mapping") || "../../docs/gamepad-hid-mapping.csv";
  const path = require("path");
  const mappingPath = path.resolve(process.cwd(), mappingRel);
  const { buttons, axes } = parseCsv(mappingPath);

  let HID: any;
  try {
    HID = await import("node-hid");
  } catch {
    const req = (Function("return require")() as NodeRequire);
    HID = req("node-hid");
  }
  const devices = HID.devices();
  const needle = String(product).toLowerCase();
  const picked = devices.find((d: any) => String(d.product || "").toLowerCase().includes(needle) || String(d.manufacturer || "").toLowerCase().includes(needle)) || devices[0];
  if (!picked) return NextResponse.json({ ok: false, error: "no HID" }, { status: 500 });
  const device = new (HID as any).HID(picked.path);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      const lastBtn = new Map<string, boolean>();
      const lastAxis = new Map<string, number>();
      let timer: any = null;
      let usingPolling = false;
      const processBuf = (buf: Buffer) => {
        try {
          const now = Date.now();
          for (const m of buttons) {
            if (m.rid != null && ((buf[0] & 0xff) !== (m.rid & 0xff))) continue;
            const pressed = ((buf[m.byte] ?? 0) & m.mask) !== 0;
            const prev = lastBtn.get(m.id);
            if (prev === undefined || prev !== pressed) { lastBtn.set(m.id, pressed); send({ id: m.id, type: "button", pressed, ts: now }); }
          }
          let changed = false;
          for (const m of axes) {
            if (m.rid != null && ((buf[0] & 0xff) !== (m.rid & 0xff))) continue;
            const raw = readU(buf, m.kind, m.byte, m.hi);
            const val = normalize(raw, m);
            const prev = lastAxis.get(m.id);
            if (prev === undefined || Math.abs(prev - val) >= 0.003) { lastAxis.set(m.id, val); changed = true; }
          }
          if (changed) {
            // Coalesce in one sample so UI updates x+y together
            const sample = {
              type: "sample",
              ts: now,
              axes: {
                lx: lastAxis.get("gamepad.axis.lx") ?? 0,
                ly: lastAxis.get("gamepad.axis.ly") ?? 0,
                rx: lastAxis.get("gamepad.axis.rx") ?? 0,
                ry: lastAxis.get("gamepad.axis.ry") ?? 0,
              },
            };
            send(sample);
          }
        } catch {}
      };
      const startPolling = () => {
        if (usingPolling) return; usingPolling = true;
        timer = setInterval(() => {
          try {
            if (typeof (device as any).readTimeout === "function") {
              const arr = (device as any).readTimeout(0);
              if (Array.isArray(arr) && arr.length > 0) processBuf(Buffer.from(arr));
            }
          } catch {}
        }, 4); // faster poll to minimize latency
      };

      // Prefer native event callback for lowest latency; fallback to polling on error
      try {
        (device as any).on("data", (buf: Buffer) => processBuf(buf));
        (device as any).on("error", () => { try { (device as any).removeAllListeners?.("data"); } catch {} startPolling(); });
      } catch {
        startPolling();
      }

      const keepAlive = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15000);
      (req as any).signal?.addEventListener?.("abort", () => {
        try { if (timer) clearInterval(timer); } catch {}
        try { clearInterval(keepAlive); } catch {}
        try { (device as any).close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
