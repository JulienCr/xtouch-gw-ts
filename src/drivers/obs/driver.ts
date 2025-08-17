import { logger } from "../../logger";
import type { Driver, ExecutionContext } from "../../types";
import { OBSWebSocket, EventSubscription, type OBSRequestTypes, type OBSResponseTypes } from "obs-websocket-js";
import { findConfigPath, loadConfig } from "../../config";
import { buildTransformUpdate, type ObsItemState } from "../obs/transforms";

export class ObsDriver implements Driver {
  readonly name = "obs";
  private obs: OBSWebSocket | null = null;
  private reconnecting = false;
  private lastKnownTransforms: Map<number, ObsItemState> = new Map();
  private cacheKeyToItemId: Map<string, number> = new Map();
  private backoffMs = 1000;

  async init(): Promise<void> { await this.connectFromConfig(); }

  async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {
    switch (action) {
      case "resolveItem": {
        const [sceneName, sourceName] = params as [string, string];
        await this.resolveItemId(sceneName, sourceName);
        return;
      }
      case "nudgeX": {
        const [sceneName, sourceName, deltaParam] = params as [string, string, number?];
        const dx = this.resolveStepDelta(deltaParam, context?.value, 2);
        await this.applyDelta(sceneName, sourceName, { dx });
        return;
      }
      case "nudgeY": {
        const [sceneName, sourceName, deltaParam] = params as [string, string, number?];
        const dy = this.resolveStepDelta(deltaParam, context?.value, 2);
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
        logger.warn(`ObsDriver: action inconnue '${action}'.`);
    }
  }

  async shutdown(): Promise<void> { try { await this.obs?.disconnect(); } catch {} this.obs = null; }

  private async connectFromConfig(): Promise<void> {
    try {
      const p = await findConfigPath(); if (!p) throw new Error("config.yaml introuvable pour OBS.");
      const cfg = await loadConfig(p);
      const host = cfg.obs?.host ?? "127.0.0.1"; const port = cfg.obs?.port ?? 4455; const password = cfg.obs?.password ?? undefined;
      const url = `ws://${host}:${port}`;

      const obs = new OBSWebSocket(); this.obs = obs;
      obs.on("ConnectionClosed", (err) => { logger.warn("OBS: connexion fermée", err as any); this.scheduleReconnect(); });
      obs.on("Identified", ({ negotiatedRpcVersion }) => { logger.info(`OBS connecté (RPC v${negotiatedRpcVersion}).`); });

      await obs.connect(url, password, { rpcVersion: 1, eventSubscriptions: EventSubscription.All & ~EventSubscription.InputVolumeMeters });
    } catch (err) { logger.warn("OBS: connexion échouée:", err as any); this.scheduleReconnect(); }
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return; this.reconnecting = true; const delay = this.backoffMs; this.backoffMs = Math.min(30000, this.backoffMs * 2);
    setTimeout(() => { this.reconnecting = false; this.connectFromConfig().catch(() => {}); }, delay);
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
    } catch (err) { logger.warn("OBS: écriture transform échouée:", err as any); try { this.cacheKeyToItemId.delete(this.key(sceneName, sourceName)); } catch {} }
  }

  private resolveStepDelta(deltaParam: number | undefined, ctxValue: unknown, baseStep: number): number {
    const step = Number.isFinite(deltaParam as number) ? Math.abs(Number(deltaParam)) : baseStep;
    const v = typeof ctxValue === "number" ? ctxValue : NaN;
    if (!Number.isFinite(v)) return step; if (v === 0 || v === 64) return 0;
    if (v >= 1 && v <= 63) return step; if (v >= 65 && v <= 127) return -step; return 0;
  }
}


