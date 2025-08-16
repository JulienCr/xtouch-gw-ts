export type DeviceMode = "mcu" | "ctrl";

export interface WaveOptions {
  mode: DeviceMode;
  durationMs: number;
  fps: number;
  faderChannels: number[]; // 1..n (for MCU PB)
  ctrlChannel: number; // for CTRL CC
  ctrlCcNumbers: number[]; // per fader index
}

export interface WaveSender {
  pb: (channel: number, value14: number) => void;
  cc: (channel: number, cc: number, value: number) => void;
}

export async function playFadersWave(sender: WaveSender, opts: WaveOptions): Promise<void> {
  const start = Date.now();
  const frameDelay = Math.max(5, Math.floor(1000 / opts.fps));
  const twoPi = Math.PI * 2;
  const phaseStep = twoPi / opts.faderChannels.length;
  while (Date.now() - start < opts.durationMs) {
    const t = (Date.now() - start) / 1000;
    for (let i = 0; i < opts.faderChannels.length; i++) {
      const phase = t * 2 + i * phaseStep;
      if (opts.mode === "mcu") {
        const value = Math.floor(((Math.sin(phase) + 1) / 2) * 16383);
        sender.pb(opts.faderChannels[i], value);
      } else {
        const value = Math.floor(((Math.sin(phase) + 1) / 2) * 127);
        const cc = opts.ctrlCcNumbers[i] ?? i;
        sender.cc(opts.ctrlChannel, cc, value);
      }
    }
    await delay(frameDelay);
  }
}

function delay(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }


