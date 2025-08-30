import { logger } from "../../logger";
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
import type { Driver, ExecutionContext } from "../../types";
import { OBSWebSocket, EventSubscription, type OBSRequestTypes, type OBSResponseTypes } from "obs-websocket-js";
import { findConfigPath, loadConfig } from "../../config";
import { buildTransformUpdate, type ObsItemState, EncoderSpeedTracker } from "../obs/transforms";

export class ObsDriver implements Driver {
	readonly name = "obs";
	private obs: OBSWebSocket | null = null;
	private reconnecting = false;
	private lastKnownTransforms: Map<number, ObsItemState> = new Map();
	private cacheKeyToItemId: Map<string, number> = new Map();
	private backoffMs = 1000;
	private encoderSpeed = new EncoderSpeedTracker();
	private sceneChangedListeners: Array<(sceneName: string) => void> = [];
	private studioModeChangedListeners: Array<(enabled: boolean) => void> = [];
	private indicatorEmitters: Array<(signal: string, value: unknown) => void> = [];
	private curStudioMode = false;
	private curProgramScene = "";
	private curPreviewScene = "";
	private selectedEmitTimer: any | null = null;
	private lastSelectedSent: string | null = null;

	// Aggregation for near-simultaneous deltas (e.g., LX+LY diagonals)
	private aggTimers: Map<string, any> = new Map();
	private aggDeltas: Map<string, { dx?: number; dy?: number; ds?: number; scene: string; source: string }> = new Map();
	private aggDelayMs = 4;

	// Continuous analog rates (per scene/source) so holding the stick yields stable motion
	private analogRates: Map<string, { scene: string; source: string; vx: number; vy: number; vs: number }> = new Map();
	private analogTimer: any | null = null;
	private lastAnalogTickMs = 0;

	// Analog tuning (can be loaded from config)
	private analogPanGain = 15; // px per 60Hz tick at full deflection (step=1)
	private analogZoomGain = 3; // scale per 60Hz tick at full deflection (base=1)
	private analogDeadzone = 0.02;
	private analogGamma = 1.5;

	private shapeAnalog(v: number): number {
		const dead = this.analogDeadzone;
		if (!Number.isFinite(v)) return 0;
		if (Math.abs(v) < dead) return 0;
		const sign = v >= 0 ? 1 : -1;
		const mag = Math.min(1, Math.max(0, Math.abs(v)));
		// Gamma curve to avoid on/off feeling: low values give finer control
		const shaped = Math.pow(mag, this.analogGamma);
		return sign * shaped;
	}

	async init(): Promise<void> { await this.connectFromConfig(); }

	/**
	 * Resynchronise l'état connu (studio mode, scènes) et republie les signaux d'indicateurs.
	 */
	async sync(): Promise<void> {
		try {
			await this.refreshIndicatorSignals();
			logger.info("OBS: sync effectué (studioMode/program/preview)");
		} catch (err) {
			logger.warn("OBS: sync a échoué:", err as any);
		}
	}
	subscribeIndicators(emit: (signal: string, value: unknown) => void): () => void {
		this.indicatorEmitters.push(emit);
		// Emit initial values best-effort
		(async () => {
			try { const v = await this.isStudioModeEnabled(); this.curStudioMode = !!v; emit("obs.studioMode", v); } catch {}
			try { const v = await this.getCurrentProgramScene(); this.curProgramScene = v; emit("obs.currentProgramScene", v); } catch {}
			try { const v = await this.getCurrentPreviewScene(); this.curPreviewScene = v; emit("obs.currentPreviewScene", v); } catch {}
			try { this.lastSelectedSent = null; this.emitSelectedScene(); } catch {}
		})().catch(() => {});
		return () => {
			const i = this.indicatorEmitters.indexOf(emit);
			if (i >= 0) this.indicatorEmitters.splice(i, 1);
		};
	}

	private emitSelectedScene(): void {
		const selected = this.curStudioMode ? this.curPreviewScene : this.curProgramScene;
		if (this.lastSelectedSent !== null && selected === this.lastSelectedSent) return;
		this.lastSelectedSent = selected;
		for (const emit of this.indicatorEmitters) { try { emit("obs.selectedScene", selected); } catch {} }
	}

	private scheduleSelectedEmit(): void {
		try { if (this.selectedEmitTimer) clearTimeout(this.selectedEmitTimer as any); } catch {}
		this.selectedEmitTimer = setTimeout(() => {
			this.selectedEmitTimer = null;
			this.emitSelectedScene();
		}, 80);
	}

	async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {
		switch (action) {
			case "setScene":
			case "changeScene": {
				const [sceneName] = params as [string]; 
				if (!this.obs) return;

				try {
					const { studioModeEnabled } = await this.obs.call("GetStudioModeEnabled");
					if (studioModeEnabled) {
						await this.obs.call("SetCurrentPreviewScene" as keyof OBSRequestTypes, { sceneName } as any);
						logger.info(`OBS (Studio Mode): preview scène → '${sceneName}'`);
					} else {
						await this.obs.call("SetCurrentProgramScene" as keyof OBSRequestTypes, { sceneName } as any);
						logger.info(`OBS: programme scène → '${sceneName}'`);
					}
				} catch (err) {
					logger.warn("OBS: changement de scène échoué:", err as any);
				}
				return;
			}
			case "toggleStudioMode": {
				if (!this.obs) return;
				const { studioModeEnabled } = await this.obs.call("GetStudioModeEnabled");
				const next = !studioModeEnabled;
				await this.obs.call("SetStudioModeEnabled" as keyof OBSRequestTypes, { studioModeEnabled: next } as any);
				logger.info(`OBS: studio mode → ${next ? "ON" : "OFF"}`);
				// Laisser les événements OBS propager l'état; on met juste à jour l'état local pour coalescer correctement
				this.curStudioMode = !!next;
				// ask for current scene and set it to the preview scene
				const currentScene = await this.getCurrentProgramScene()
				this.curPreviewScene = currentScene;
				this.scheduleSelectedEmit();
				return;
			}
			case "resolveItem": {
				const [sceneName, sourceName] = params as [string, string];
				await this.resolveItemId(sceneName, sourceName);
				return;
			}
			case "nudgeX": {
				const [sceneName, sourceName, deltaParam] = params as [string, string, number?];
				const step = Number.isFinite(deltaParam as number) ? Math.abs(Number(deltaParam)) : 2;
				const v = typeof context?.value === "number" ? (context!.value as number) : NaN;
				if (Number.isFinite(v) && v >= -1 && v <= 1) {
                    const gain = this.analogPanGain; // px per 60Hz tick at full deflection
					const vv = this.shapeAnalog(v);
					this.setAnalogRate(sceneName, sourceName, { vx: vv * step * gain });
					return;
				}
				const base = this.resolveStepDelta(deltaParam, context?.value, step);
				const dx = this.encoderSpeed.resolveAdaptiveDelta(context?.controlId ?? "encX", base);
				this.scheduleApplyAggregated(sceneName, sourceName, { dx });
				return;
			}
			case "nudgeY": {
				const [sceneName, sourceName, deltaParam] = params as [string, string, number?];
				const step = Number.isFinite(deltaParam as number) ? Math.abs(Number(deltaParam)) : 2;
				const v = typeof context?.value === "number" ? (context!.value as number) : NaN;
				if (Number.isFinite(v) && v >= -1 && v <= 1) {
                    const gain = this.analogPanGain; // px per 60Hz tick
					const vv = this.shapeAnalog(v);
					this.setAnalogRate(sceneName, sourceName, { vy: vv * step * gain });
					return;
				}
				const base = this.resolveStepDelta(deltaParam, context?.value, step);
				const dy = this.encoderSpeed.resolveAdaptiveDelta(context?.controlId ?? "encY", base);
				this.scheduleApplyAggregated(sceneName, sourceName, { dy });
				return;
			}
			case "scaleUniform": {
				const [sceneName, sourceName, deltaParam] = params as [string, string, number?];
				const base = Number.isFinite(deltaParam as number) ? Number(deltaParam) : 0.01;
				const v = typeof context?.value === "number" ? (context!.value as number) : NaN;
				let ds: number;
				if (Number.isFinite(v) && v >= -1 && v <= 1) {
                    const gain = this.analogZoomGain; // per 60Hz tick
					const vv = this.shapeAnalog(v);
					this.setAnalogRate(sceneName, sourceName, { vs: vv * base * gain });
					return;
				} else {
					ds = this.resolveStepDelta(deltaParam, context?.value, base);
				}
				logger.debug(`OBS scaleUniform -> scene='${sceneName}' source='${sourceName}' ds=${ds} (ctx=${String(context?.value)})`);
				this.scheduleApplyAggregated(sceneName, sourceName, { ds });
				return;
			}
			default:
				// Is that case, consider the action as is and try to execute it
				try { await this.obs?.call(action as keyof OBSRequestTypes, params as any); } catch (err) { logger.warn(`ObsDriver: action '${action}' inconnue:`, err as any); }
				return;
		}
	}

	async shutdown(): Promise<void> { try { await this.obs?.disconnect(); } catch { } this.obs = null; }

	private async connectFromConfig(): Promise<void> {
		try {
			const p = await findConfigPath(); if (!p) throw new Error("config.yaml introuvable pour OBS.");
      const cfg = await loadConfig(p);
      // Load analog tuning if present
      try {
        const a = (cfg as any).gamepad?.analog || {};
        if (typeof a.pan_gain === 'number') this.analogPanGain = Math.max(0, a.pan_gain);
        if (typeof a.zoom_gain === 'number') this.analogZoomGain = Math.max(0, a.zoom_gain);
        if (typeof a.deadzone === 'number') this.analogDeadzone = Math.min(1, Math.max(0, a.deadzone));
        if (typeof a.gamma === 'number') this.analogGamma = Math.max(0.5, Math.min(4, a.gamma));
      } catch {}
			const host = cfg.obs?.host ?? "127.0.0.1"; const port = cfg.obs?.port ?? 4455; const password = cfg.obs?.password ?? undefined;
			const url = `ws://${host}:${port}`;

			const obs = new OBSWebSocket(); this.obs = obs;
			obs.on("ConnectionClosed", (err) => { logger.warn("OBS: connexion fermée", err as any); this.scheduleReconnect(); });
			obs.on("Identified", async ({ negotiatedRpcVersion }) => { logger.info(`OBS connecté (RPC v${negotiatedRpcVersion}).`); try { await this.refreshIndicatorSignals(); } catch {} });
			obs.on("CurrentProgramSceneChanged", (e: any) => {
				try {
					const sceneName = (e as any)?.sceneName ?? (e as any)?.sceneNameOld ?? "";
					for (const cb of this.sceneChangedListeners) {
						try { cb(sceneName); } catch { }
					}
					this.curProgramScene = sceneName;
					for (const emit of this.indicatorEmitters) { try { emit("obs.currentProgramScene", sceneName); } catch {} }
					this.scheduleSelectedEmit();
					logger.debug(`OBS event: CurrentProgramSceneChanged → '${sceneName}'`);
				} catch { }
			});

			// Studio mode state changes
			obs.on("StudioModeStateChanged" as any, (e: any) => {
				try {
					const enabled = !!((e as any)?.studioModeEnabled);
					for (const cb of this.studioModeChangedListeners) {
						try { cb(enabled); } catch {}
					}
					this.curStudioMode = enabled;
					for (const emit of this.indicatorEmitters) { try { emit("obs.studioMode", enabled); } catch {} }
					this.scheduleSelectedEmit();
					logger.debug(`OBS event: StudioModeStateChanged → ${enabled ? "ON" : "OFF"}`);
				} catch {}
			});

			obs.on("CurrentPreviewSceneChanged" as any, (e: any) => {
				try {
					const sceneName = (e as any)?.sceneName ?? (e as any)?.sceneNameOld ?? "";
					this.curPreviewScene = sceneName;
					for (const emit of this.indicatorEmitters) { try { emit("obs.currentPreviewScene", sceneName); } catch {} }
					this.scheduleSelectedEmit();
					logger.debug(`OBS event: CurrentPreviewSceneChanged → '${sceneName}'`);
				} catch { }
			});

			await obs.connect(url, password, { rpcVersion: 1, eventSubscriptions: EventSubscription.All & ~EventSubscription.InputVolumeMeters });
		} catch (err) { logger.warn("OBS: connexion échouée:", err as any); this.scheduleReconnect(); }
	}

	private scheduleReconnect(): void {
		if (this.reconnecting) return; this.reconnecting = true; const delay = this.backoffMs; this.backoffMs = Math.min(30000, this.backoffMs * 2);
		setTimeout(() => { this.reconnecting = false; this.connectFromConfig().catch(() => { }); }, delay);
	}

	private key(sceneName: string, sourceName: string): string { return `${sceneName}::${sourceName}`; }

	private async resolveItemId(sceneName: string, sourceName: string): Promise<number | null> {
		if (!this.obs) return null; const k = this.key(sceneName, sourceName); const cached = this.cacheKeyToItemId.get(k); if (cached != null) return cached;
		try { const res = await this.obs.call("GetSceneItemId" as keyof OBSRequestTypes, { sceneName, sourceName } as any); const id = (res as any).sceneItemId as number; this.cacheKeyToItemId.set(k, id); return id; }
		catch (err) { logger.warn(`OBS: GetSceneItemId échoué pour '${sceneName}'/'${sourceName}':`, err as any); return null; }
	}

	private async readCurrent(sceneName: string, id: number): Promise<ObsItemState | null> {
		if (!this.obs) return null;
		try {
			const res = await this.obs.call("GetSceneItemTransform" as keyof OBSRequestTypes, { sceneName, sceneItemId: id } as any);
			const t = (res as any).sceneItemTransform as OBSResponseTypes["GetSceneItemTransform"]["sceneItemTransform"];
			const s: ObsItemState = {
				x: Number((t.positionX as any) ?? 0), y: Number((t.positionY as any) ?? 0), scale: Number((t.scaleX as any) ?? 1),
				width: Number((t as any).width ?? NaN) || undefined, height: Number((t as any).height ?? NaN) || undefined,
				boundsW: Number((t as any).boundsWidth ?? 0) || undefined, boundsH: Number((t as any).boundsHeight ?? 0) || undefined,
				alignment: Number((t as any).alignment ?? NaN),
			};
			logger.debug(`OBS read transform ← id=${id}: x=${s.x} y=${s.y} scale=${s.scale} width=${s.width ?? "-"} height=${s.height ?? "-"} boundsW=${s.boundsW ?? "-"} boundsH=${s.boundsH ?? "-"} alignment=${s.alignment ?? "-"}`);
			this.lastKnownTransforms.set(id, s); return s;
		} catch (err) { logger.warn("OBS: lecture transform échouée:", err as any); return null; }
	}

	private async applyDelta(sceneName: string, sourceName: string, delta: { dx?: number; dy?: number; ds?: number }): Promise<void> {
		if (!this.obs) return; const id = await this.resolveItemId(sceneName, sourceName); if (id == null) return;
		const cur = (await this.readCurrent(sceneName, id)) ?? this.lastKnownTransforms.get(id) ?? { x: 0, y: 0, scale: 1 } as ObsItemState;
		try {
			const { sceneItemTransform, next } = buildTransformUpdate(cur, delta);
			logger.debug(`OBS write transform → id=${id} delta=${JSON.stringify(delta)} cur=${JSON.stringify(cur)} next=${JSON.stringify(next)} fields=${Object.keys(sceneItemTransform).join(",")}`);
			if (delta.ds !== undefined) { const factor = 1 + (delta.ds ?? 0); logger.debug(`OBS scale factor=${factor} width=${cur.width ?? "-"} height=${cur.height ?? "-"}`); }
			await this.obs.call("SetSceneItemTransform" as keyof OBSRequestTypes, { sceneName, sceneItemId: id, sceneItemTransform } as any);
			logger.trace(`OBS write OK for id=${id}`);
			this.lastKnownTransforms.set(id, next);
		} catch (err) { logger.warn("OBS: écriture transform échouée:", err as any); try { this.cacheKeyToItemId.delete(this.key(sceneName, sourceName)); } catch { } }
	}

	/**
	 * Agrège des deltas proches dans le temps pour une même cible et applique en un seul SetSceneItemTransform.
	 */
	private scheduleApplyAggregated(sceneName: string, sourceName: string, delta: { dx?: number; dy?: number; ds?: number }): void {
		const k = this.key(sceneName, sourceName);
		const acc = this.aggDeltas.get(k) ?? { scene: sceneName, source: sourceName };
		if (delta.dx != null) acc.dx = (acc.dx ?? 0) + delta.dx;
		if (delta.dy != null) acc.dy = (acc.dy ?? 0) + delta.dy;
		if (delta.ds != null) acc.ds = (acc.ds ?? 0) + delta.ds;
		this.aggDeltas.set(k, acc);
		if (!this.aggTimers.has(k)) {
			const t = setTimeout(async () => {
				this.aggTimers.delete(k);
				const d = this.aggDeltas.get(k);
				this.aggDeltas.delete(k);
				if (!d) return;
				try { await this.applyDelta(d.scene, d.source, { dx: d.dx, dy: d.dy, ds: d.ds }); } catch {}
			}, this.aggDelayMs);
			this.aggTimers.set(k, t);
		}
	}

	private key(sceneName: string, sourceName: string): string { return `${sceneName}::${sourceName}`; }

	private setAnalogRate(sceneName: string, sourceName: string, patch: { vx?: number; vy?: number; vs?: number }): void {
		const k = this.key(sceneName, sourceName);
		const cur = this.analogRates.get(k) ?? { scene: sceneName, source: sourceName, vx: 0, vy: 0, vs: 0 };
		const dead = 0.02;
		if (patch.vx != null) cur.vx = Math.abs(patch.vx) < dead ? 0 : patch.vx;
		if (patch.vy != null) cur.vy = Math.abs(patch.vy) < dead ? 0 : patch.vy;
		if (patch.vs != null) cur.vs = Math.abs(patch.vs) < dead ? 0 : patch.vs;
		if (cur.vx === 0 && cur.vy === 0 && cur.vs === 0) {
			this.analogRates.delete(k);
		} else {
			this.analogRates.set(k, cur);
			this.ensureAnalogTimer();
		}
		if (this.analogRates.size === 0) this.stopAnalogTimer();
	}

	private ensureAnalogTimer(): void {
		if (this.analogTimer) return;
		this.lastAnalogTickMs = Date.now();
		this.analogTimer = setInterval(() => this.onAnalogTick(), 16);
	}

	private stopAnalogTimer(): void {
		if (!this.analogTimer) return;
		try { clearInterval(this.analogTimer as any); } catch {}
		this.analogTimer = null;
	}

	private async onAnalogTick(): Promise<void> {
		const now = Date.now();
		const dt = Math.max(0.001, (now - this.lastAnalogTickMs) / 16); // normalize to 60Hz ticks
		this.lastAnalogTickMs = now;
		for (const cur of this.analogRates.values()) {
			const dx = cur.vx * dt;
			const dy = cur.vy * dt;
			const ds = cur.vs * dt;
			if (dx !== 0 || dy !== 0 || ds !== 0) {
				try { await this.applyDelta(cur.scene, cur.source, { dx: dx || undefined, dy: dy || undefined, ds: ds || undefined }); } catch {}
			}
		}
		if (this.analogRates.size === 0) this.stopAnalogTimer();
	}

	private resolveStepDelta(deltaParam: number | undefined, ctxValue: unknown, baseStep: number): number {
		const step = Number.isFinite(deltaParam as number) ? Math.abs(Number(deltaParam)) : baseStep;
		const v = typeof ctxValue === "number" ? ctxValue : NaN;
		if (!Number.isFinite(v)) return step;
		// Support analog normalized input (-1..+1) from HID sticks/triggers
		if (v >= -1 && v <= 1) {
			const dead = 0.02; // small deadzone for noise
			if (Math.abs(v) < dead) return 0;
			return v > 0 ? step : -step;
		}
		// Legacy encoder semantics: 1..63 positive, 65..127 negative, 0/64 no-op
		if (v === 0 || v === 64) return 0;
		if (v >= 1 && v <= 63) return step;
		if (v >= 65 && v <= 127) return -step;
		return 0;
	}

	/**
	 * Enregistre un callback appelé à chaque changement de scène programme.
	 */
	onSceneChanged(cb: (sceneName: string) => void): () => void {
		this.sceneChangedListeners.push(cb);
		return () => {
			const i = this.sceneChangedListeners.indexOf(cb);
			if (i >= 0) this.sceneChangedListeners.splice(i, 1);
		};
	}

	/**
	 * Retourne l'état courant du Studio Mode (true/false). Vide si erreur (false par défaut).
	 */
	async isStudioModeEnabled(): Promise<boolean> {
		try {
			if (!this.obs) return false;
			const { studioModeEnabled } = await this.obs.call("GetStudioModeEnabled");
			return !!studioModeEnabled;
		} catch {
			return false;
		}
	}

	/**
	 * S'abonne aux changements d'état du Studio Mode.
	 */
	onStudioModeChanged(cb: (enabled: boolean) => void): () => void {
		this.studioModeChangedListeners.push(cb);
		return () => {
			const i = this.studioModeChangedListeners.indexOf(cb);
			if (i >= 0) this.studioModeChangedListeners.splice(i, 1);
		};
	}

	/**
	 * Retourne le nom de la scène programme courante (ou chaîne vide en cas d'erreur).
	 */
	async getCurrentProgramScene(): Promise<string> {
		try {
			if (!this.obs) return "";
			const res = await this.obs.call("GetCurrentProgramScene" as keyof OBSRequestTypes, {} as any);
			return (res as any)?.currentProgramSceneName ?? "";
		} catch {
			return "";
		}
	}

	/**
	 * Retourne le nom de la scène preview courante (ou chaîne vide en cas d'erreur).
	 */
	async getCurrentPreviewScene(): Promise<string> {
		try {
			if (!this.obs) return "";
			const res = await this.obs.call("GetCurrentPreviewScene" as keyof OBSRequestTypes, {} as any);
			return (res as any)?.currentPreviewSceneName ?? "";
		} catch {
			return "";
		}
	}

	private async refreshIndicatorSignals(): Promise<void> {
		try {
		  const studio = await this.isStudioModeEnabled();
		  this.curStudioMode = !!studio;
		  for (const emit of this.indicatorEmitters) { try { emit("obs.studioMode", studio); } catch {} }
		} catch {}
	  
		try {
		  const prog = await this.getCurrentProgramScene();
		  this.curProgramScene = prog;
		  for (const emit of this.indicatorEmitters) { try { emit("obs.currentProgramScene", prog); } catch {} }
		} catch {}
	  
		try {
		  const prev = await this.getCurrentPreviewScene();
		  this.curPreviewScene = prev;
		  for (const emit of this.indicatorEmitters) { try { emit("obs.currentPreviewScene", prev); } catch {} }
		} catch {}
	  
		this.lastSelectedSent = null; // force initial selected emit
		this.emitSelectedScene();
	  }
}
