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
				const base = this.resolveStepDelta(deltaParam, context?.value, 2);
				const dx = this.encoderSpeed.resolveAdaptiveDelta(context?.controlId ?? "encX", base);
				await this.applyDelta(sceneName, sourceName, { dx });
				return;
			}
			case "nudgeY": {
				const [sceneName, sourceName, deltaParam] = params as [string, string, number?];
				const base = this.resolveStepDelta(deltaParam, context?.value, 2);
				const dy = this.encoderSpeed.resolveAdaptiveDelta(context?.controlId ?? "encY", base);
				await this.applyDelta(sceneName, sourceName, { dy });
				return;
			}
			case "scaleUniform": {
				const [sceneName, sourceName, deltaParam] = params as [string, string, number?];
				const ds = this.resolveStepDelta(deltaParam, context?.value, 0.01);
				logger.debug(`OBS scaleUniform -> scene='${sceneName}' source='${sourceName}' ds=${ds} (ctx=${String(context?.value)})`);
				await this.applyDelta(sceneName, sourceName, { ds });
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

	private resolveStepDelta(deltaParam: number | undefined, ctxValue: unknown, baseStep: number): number {
		const step = Number.isFinite(deltaParam as number) ? Math.abs(Number(deltaParam)) : baseStep;
		const v = typeof ctxValue === "number" ? ctxValue : NaN;
		if (!Number.isFinite(v)) return step; if (v === 0 || v === 64) return 0;
		if (v >= 1 && v <= 63) return step; if (v >= 65 && v <= 127) return -step; return 0;
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


