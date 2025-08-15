import type { MidiStatus } from "../state";
import type { Router } from "../router";

export class LatencyMeter {
	private readonly window: number[] = [];
	private readonly maxSize = 256;
	private lastMs = 0;

	record(ms: number): void {
		this.lastMs = ms;
		this.window.push(ms);
		if (this.window.length > this.maxSize) this.window.shift();
	}

	reset(): void {
		this.window.length = 0;
		this.lastMs = 0;
	}

	summary(): { count: number; last: number; p50: number; p95: number; max: number } {
		const arr = this.window.slice().sort((a, b) => a - b);
		const n = arr.length;
		const pct = (p: number) => (n === 0 ? 0 : arr[Math.min(n - 1, Math.max(0, Math.round((p / 100) * (n - 1))))]);
		const mx = n === 0 ? 0 : arr[n - 1];
		return { count: n, last: this.lastMs, p50: pct(50), p95: pct(95), max: mx };
	}
}

export interface LatencyReportItem { count: number; last: number; p50: number; p95: number; max: number }
export type LatencyReport = Record<string, Record<MidiStatus, LatencyReportItem>>;

export function attachLatencyExtensions(RouterClass: any): void {
	(RouterClass as any).prototype.getLatencyReport = function getLatencyReport(this: Router): LatencyReport {
		const self = this as any;
		const meters = self.latencyMeters as Record<string, Record<MidiStatus, LatencyMeter>>;
		const out: any = {};
		for (const app of Object.keys(meters) as string[]) {
			out[app] = {} as any;
			for (const st of ["note","cc","pb","sysex"] as MidiStatus[]) {
				out[app][st] = meters[app][st].summary();
			}
		}
		return out;
	};

	(RouterClass as any).prototype.resetLatency = function resetLatency(this: Router): void {
		const self = this as any;
		const meters = self.latencyMeters as Record<string, Record<MidiStatus, LatencyMeter>>;
		for (const app of Object.keys(meters) as string[]) {
			for (const st of ["note","cc","pb","sysex"] as MidiStatus[]) {
				meters[app][st].reset();
			}
		}
	};

	(RouterClass as any).prototype.getAntiLoopMs = function getAntiLoopMs(this: Router, status: MidiStatus): number {
		const self = this as any;
		return (self.antiLoopWindowMsByStatus?.[status] ?? 60) as number;
	};
}


