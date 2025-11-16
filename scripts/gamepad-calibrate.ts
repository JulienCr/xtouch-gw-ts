/* eslint-disable @typescript-eslint/no-implied-eval */
/**
 * Interactive HID gamepad calibrator (node-hid).
 * - Prompts to press specific controls, captures raw reports, and infers mapping.
 * - Writes CSV mapping usable by the HID provider.
 */

declare const process: any;

import fs from "fs";

type HIDDeviceInfo = { path: string; vendorId: number; productId: number; product?: string; manufacturer?: string };

const HID = require("node-hid");

const STANDARD_IDS = [
  // Buttons
  "gamepad.btn.a", "gamepad.btn.b", "gamepad.btn.x", "gamepad.btn.y",
  "gamepad.btn.plus", "gamepad.btn.minus", "gamepad.btn.home", "gamepad.btn.capture",
  "gamepad.btn.lb", "gamepad.btn.rb", "gamepad.btn.l3", "gamepad.btn.r3",
  "gamepad.dpad.up", "gamepad.dpad.down", "gamepad.dpad.left", "gamepad.dpad.right",
  // Axes
  "gamepad.axis.lx", "gamepad.axis.ly", "gamepad.axis.rx", "gamepad.axis.ry",
  "gamepad.axis.zl", "gamepad.axis.zr",
] as const;

async function prompt(q: string): Promise<string> {
  process.stdout.write(q);
  return await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data: string) => resolve(String(data || "").trim()));
  });
}

function pickDevice(devices: HIDDeviceInfo[], productMatch?: string): HIDDeviceInfo | null {
  if (productMatch) {
    const needle = productMatch.toLowerCase();
    const found = devices.find((d) => String(d.product||"").toLowerCase().includes(needle) || String(d.manufacturer||"").toLowerCase().includes(needle));
    if (found) return found;
  }
  if (devices.length === 0) return null;
  console.log("Devices:");
  devices.forEach((d, i) => console.log(`${i}) ${d.vendorId.toString(16)}:${d.productId.toString(16)} '${d.product||""}' ${d.path}`));
  const ans = Number(process.env.DEVICE_INDEX || ""), idx = Number.isFinite(ans) ? ans : Number(prompt("Select index: "));
  if (!Number.isFinite(idx) || idx < 0 || idx >= devices.length) return devices[0];
  return devices[idx | 0];
}

type ButtonMapping = { id: string; type: "bit"; byte: number; mask: number; rid?: number };
type AxisMapping = { id: string; type: "u8"|"u16le"; byte: number; hi?: number; min?: number; max?: number; center?: number; normalize?: "n01"|"pm1"; rid?: number };

async function main(): Promise<void> {
  const outPath = process.argv.find((a: string) => a.startsWith("--out="))?.slice("--out=".length) || "docs/gamepad-hid-mapping.csv";
  const productMatch = process.argv.find((a: string) => a.startsWith("--product="))?.slice("--product=".length);
  const devices: HIDDeviceInfo[] = HID.devices();
  const picked = pickDevice(devices, productMatch);
  if (!picked) throw new Error("No HID devices");
  console.log(`Using device: ${picked.vendorId.toString(16)}:${picked.productId.toString(16)} '${picked.product||""}'`);

  let dev: any;
  try {
    dev = new HID.HID(picked.path);
  } catch (err) {
    console.error("Failed to open HID device:", (err as any)?.message || err);
    process.exit(1);
    return;
  }
  try { dev.setNonBlocking?.(true); } catch { /* ignore */ }
  dev.on("error", (err: any) => { try { console.warn("HID error:", err?.message || err); } catch {} });

  let latest: Buffer = Buffer.alloc(0);
  dev.on("data", (buf: Buffer) => { latest = buf; });

  // Baseline
  console.log("Ensure controller is idle (no buttons, sticks centered).");
  await prompt("Press Enter to capture baseline... ");
  const baseline = latest;
  console.log(`Baseline length=${baseline?.length ?? 0}`);

  const buttons: ButtonMapping[] = [];
  const axes: AxisMapping[] = [];

  async function capturePressed(id: string): Promise<Buffer> {
    console.log(`→ ${id}: Hold the control (pressed/deflected), then press Enter...`);
    await prompt("");
    return latest;
  }

  function inferButton(base: Buffer, cur: Buffer): { byte: number; mask: number } | null {
    const len = Math.min(base?.length || 0, cur?.length || 0);
    let best: { byte: number; mask: number } | null = null;
    for (let i = 0; i < len; i++) {
      const b = base[i], c = cur[i];
      const diff = b ^ c;
      if (diff) {
        // Prefer bits that are 0->1 (pressed)
        const rising = diff & c;
        const mask = rising ? rising & -rising : diff & -diff;
        best = { byte: i, mask };
        break;
      }
    }
    return best;
  }

  function inferAxis(base: Buffer, cur: Buffer): { type: "u8"|"u16le"; byte: number; hi?: number; min: number; max: number; center: number } | null {
    const len = Math.min(base?.length || 0, cur?.length || 0);
    const deltas: Array<{ i: number; d: number }> = [];
    for (let i = 0; i < len; i++) {
      deltas.push({ i, d: Math.abs((cur[i] || 0) - (base[i] || 0)) });
    }
    deltas.sort((a, b) => b.d - a.d);
    const top = deltas[0];
    if (!top || top.d === 0) return null;
    const i = top.i;
    // Check adjacent for 16-bit little endian
    const j = i + 1 < len ? i + 1 : i - 1;
    const d2 = j >= 0 ? Math.abs((cur[j] || 0) - (base[j] || 0)) : 0;
    if (d2 > 0) {
      // Assume u16le with i as low byte
      const lo = i < j ? i : j, hi = i < j ? j : i;
      const read = (buf: Buffer) => (buf[lo] | (buf[hi] << 8));
      const min = Math.min(read(base), read(cur));
      const max = Math.max(read(base), read(cur));
      const center = read(base);
      return { type: "u16le", byte: lo, hi, min, max, center };
    }
    // Fallback 1-byte
    const min = Math.min(base[i], cur[i]);
    const max = Math.max(base[i], cur[i]);
    const center = base[i];
    return { type: "u8", byte: i, min, max, center };
  }

  for (const id of STANDARD_IDS) {
    const cur = await capturePressed(id);
    if (!cur || cur.length === 0) { console.log("No data captured; skipping"); continue; }
    if (id.startsWith("gamepad.axis.")) {
      const axis = inferAxis(baseline, cur);
      if (axis) {
        const rid = Number(cur?.[0] ?? NaN);
        axes.push({ id, type: axis.type, byte: axis.byte, hi: axis.hi, min: axis.min, max: axis.max, center: axis.center, normalize: id.endsWith("x")||id.endsWith("y")?"pm1":"n01", rid: Number.isFinite(rid) ? rid : undefined });
        console.log(`Axis ${id}: ${axis.type} @ byte ${axis.byte}${axis.hi!=null?"/"+axis.hi:""} min=${axis.min} max=${axis.max} center=${axis.center} rid=${Number.isFinite(rid)?rid:"-"}`);
      } else {
        console.log(`Axis ${id}: could not infer.`);
      }
    } else {
      const btn = inferButton(baseline, cur);
      if (btn) {
        const rid = Number(cur?.[0] ?? NaN);
        buttons.push({ id, type: "bit", byte: btn.byte, mask: btn.mask, rid: Number.isFinite(rid) ? rid : undefined });
        console.log(`Button ${id}: bit @ byte ${btn.byte} mask=0x${btn.mask.toString(16)} rid=${Number.isFinite(rid)?rid:"-"}`);
      } else {
        console.log(`Button ${id}: could not infer.`);
      }
    }
    // small delay
    await new Promise((r) => setTimeout(r, 150));
  }

  const lines: string[] = [];
  lines.push(["id","type","byte","hi","mask","min","max","center","normalize","rid"].join(","));
  for (const b of buttons) lines.push([b.id,b.type,String(b.byte),"",`0x${b.mask.toString(16)}`,"","","","",String(b.rid??"")].join(","));
  for (const a of axes) lines.push([a.id,a.type,String(a.byte),String(a.hi??""),"",String(a.min??""),String(a.max??""),String(a.center??""),String(a.normalize??"n01"),String(a.rid??"")].join(","));
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Written mapping to ${outPath}`);
  try { dev.close(); } catch {}
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
