"use client";
import { useEffect, useState } from "react";

type AxisState = { lx: number; ly: number; rx: number; ry: number };

export default function GamepadViewer() {
  const [axes, setAxes] = useState<AxisState>({ lx: 0, ly: 0, rx: 0, ry: 0 });
  const [connected, setConnected] = useState(false);
  const [latMs, setLatMs] = useState<number | null>(null);

  useEffect(() => {
    const src = new EventSource(`/api/gamepad/stream?product=${encodeURIComponent("Faceoff Wired Pro Controller")}&mapping=${encodeURIComponent("../../docs/gamepad-hid-mapping.csv")}`);
    const alpha = 1.0; // no smoothing to assess latency
    src.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev?.type === "sample" && ev.axes) {
          setConnected(true);
          if (typeof ev.ts === "number") setLatMs(Math.max(0, Date.now() - Number(ev.ts)));
          setAxes((prev) => smoothAxes(prev, ev.axes, alpha));
        } else if (ev?.type === "axis") {
          // Fallback per-axis updates
          setConnected(true);
          setAxes((prev) => {
            const raw = { ...prev } as any;
            raw[ev.id.split(".").slice(-1)[0]] = Number(ev.value) || 0;
            return smoothAxes(prev, { lx: raw.lx, ly: raw.ly, rx: raw.rx, ry: raw.ry }, alpha);
          });
        }
      } catch {}
    };
    src.onerror = () => setConnected(false);
    return () => { try { src.close(); } catch {} };
  }, []);

  return (
    <main className="min-h-screen p-4 space-y-6">
      <h1 className="text-xl font-bold">Gamepad – Sticks Viewer</h1>
      <p className="text-sm text-gray-600">{connected ? `Connected${latMs!=null?` • ~${latMs}ms`:''}` : "Waiting for input…"}</p>
      <div className="grid grid-cols-2 gap-8 max-w-3xl">
        <StickPanel title="Left Stick" x={axes.lx} y={axes.ly} />
        <StickPanel title="Right Stick" x={axes.rx} y={axes.ry} />
      </div>
    </main>
  );
}

function smoothAxes(prev: AxisState, next: Partial<AxisState>, alpha: number): AxisState {
  const n = {
    lx: typeof next.lx === "number" ? next.lx : prev.lx,
    ly: typeof next.ly === "number" ? next.ly : prev.ly,
    rx: typeof next.rx === "number" ? next.rx : prev.rx,
    ry: typeof next.ry === "number" ? next.ry : prev.ry,
  };
  return {
    lx: prev.lx + (n.lx - prev.lx) * alpha,
    ly: prev.ly + (n.ly - prev.ly) * alpha,
    rx: prev.rx + (n.rx - prev.rx) * alpha,
    ry: prev.ry + (n.ry - prev.ry) * alpha,
  };
}

function StickPanel({ title, x, y }: { title: string; x: number; y: number }) {
  const cx = 80, cy = 80, r = 70;
  // Clamp vector to unit circle to respect the stick gate (diagonals)
  const vx = Math.max(-1, Math.min(1, x));
  const vy = Math.max(-1, Math.min(1, y));
  const len = Math.hypot(vx, vy) || 1;
  const scale = len > 1 ? 1 / len : 1;
  const dotX = cx + (vx * scale * r);
  const dotY = cy + (vy * scale * r);
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <svg width={160} height={160} className="border rounded bg-white">
        <circle cx={cx} cy={cy} r={r} fill="#f8fafc" stroke="#94a3b8" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#cbd5e1" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#cbd5e1" />
        <circle cx={dotX} cy={dotY} r={8} fill="#2563eb" />
      </svg>
      <div className="text-xs text-gray-600">x={x.toFixed(3)} y={y.toFixed(3)}</div>
    </div>
  );
}
