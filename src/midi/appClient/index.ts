import { Input, Output } from "@julusian/midi";
import { logger } from "../../logger";
import type { ControlMidiSpec } from "../../types";
import type { AppConfig, PageConfig } from "../../config";
import { findPortIndexByNameFragment } from "../ports";
import { scheduleFaderSetpoint } from "../../xtouch/faderSetpoint";
import { resolvePbToCcMappingForApp } from "../../router/page";
import { clamp, getGlobalXTouch, hasPassthroughForApp, hasPassthroughAnywhereForApp, markAppOutgoingAndForward } from "./core";
import { ensureFeedbackOpen } from "./feedback";
import { resolveAppKey } from "../../shared/appKey";

export class MidiAppClient {
  private readonly outPerApp: Map<string, Output> = new Map();
  private readonly inPerApp: Map<string, Input> = new Map();
  private readonly appToOutName: Map<string, string> = new Map();
  private readonly appToInName: Map<string, string> = new Map();
  /**
   * Retry timers for reopening OUT ports per app. Keyed by app key.
   * The delay grows linearly up to a small cap to avoid spamming the MIDI stack.
   */
  private readonly outRetryTimers = new Map<string, { count: number; timer: NodeJS.Timeout }>();

  async init(cfg: AppConfig): Promise<void> {
    this.appToOutName.clear();
    this.appToInName.clear();
    try {
      const list = cfg?.midi?.apps || [];
      for (const it of list) {
        const name = (it?.name || "").trim();
        if (!name) continue;
        if (it.output_port) this.appToOutName.set(name, it.output_port);
        if (it.input_port) this.appToInName.set(name, it.input_port);
      }
    } catch {}
  }

  async reconfigure(cfg: AppConfig): Promise<void> {
    try {
      for (const o of this.outPerApp.values()) { try { o.closePort(); } catch {} }
      for (const i of this.inPerApp.values()) { try { i.closePort(); } catch {} }
    } finally {
      this.outPerApp.clear();
      this.inPerApp.clear();
      for (const t of this.outRetryTimers.values()) { try { clearTimeout(t.timer); } catch {} }
      this.outRetryTimers.clear();
    }
    await this.init(cfg);
  }

  async send(app: string, spec: ControlMidiSpec, value: unknown): Promise<void> {
    const appKey = String(app).trim();
    const needle = this.appToOutName.get(appKey) || appKey;
    const out = await this.ensureOutOpen(appKey, needle, true);
    if (!out) return;

    const channel = clamp(Number(spec.channel) | 0, 1, 16);

    if (spec.type === "passthrough") {
      const input = Array.isArray(value) ? (value as unknown[]) : null;
      if (input && input.length >= 1) {
        const status = (Number(input[0]) | 0) & 0xff;
        const dataBytes = input.slice(1).map((n) => clamp(Number(n) | 0, 0, 127));
        const tx: number[] = [status, ...dataBytes];
        this.sendSafe(appKey, out, tx, needle);
        if (!hasPassthroughForApp(appKey)) {
          markAppOutgoingAndForward(appKey, tx, needle);
        }
        ensureFeedbackOpen(appKey, { inPerApp: this.inPerApp, appToInName: this.appToInName }).catch(() => {});
      }
      return;
    }

    const statusNibble = spec.type === "note" ? 0x9 : spec.type === "cc" ? 0xB : 0xE;
    const status = (statusNibble << 4) | (channel - 1);

    if (spec.type === "note") {
      const note = clamp(Number(spec.note) | 0, 0, 127);
      const vel = clamp(Number(value) | 0, 0, 127);
      const bytes: number[] = [status, note, vel];
      this.sendSafe(appKey, out, bytes, needle);
      if (!hasPassthroughForApp(appKey)) {
        markAppOutgoingAndForward(appKey, bytes, needle);
      }
      ensureFeedbackOpen(appKey, { inPerApp: this.inPerApp, appToInName: this.appToInName }).catch(() => {});
      return;
    }

    if (spec.type === "cc") {
      const cc = clamp(Number(spec.cc) | 0, 0, 127);
      let v7 = 0;
      if (typeof value === "number" && Number.isFinite(value)) {
        const v = value as number;
        if (v > 127) {
          v7 = Math.round(clamp(v, 0, 16383) / 16383 * 127);
          const xt = getGlobalXTouch();
          if (xt) {
            let mappedChannel: number | null = null;
            try {
              const g = (global as unknown as { __router__?: { getActivePage: () => PageConfig | undefined } }).__router__;
              const page = g?.getActivePage?.();
              if (page) {
                const m = resolvePbToCcMappingForApp(page, appKey as any);
                const ch = m?.channelForCc?.get(cc);
                if (typeof ch === "number" && Number.isFinite(ch) && ch >= 1 && ch <= 16) mappedChannel = ch;
              }
            } catch {}
            if (mappedChannel != null) {
              scheduleFaderSetpoint(xt, mappedChannel, clamp((value as number) | 0, 0, 16383));
            }
          }
        } else {
          v7 = clamp(v | 0, 0, 127);
        }
      }
      const bytes: number[] = [status, cc, v7];
      this.sendSafe(appKey, out, bytes, needle);
      if (!hasPassthroughForApp(appKey)) {
        markAppOutgoingAndForward(appKey, bytes, needle);
      }
      ensureFeedbackOpen(appKey, { inPerApp: this.inPerApp, appToInName: this.appToInName }).catch(() => {});
      return;
    }

    const v14 = clamp(Number(value) | 0, 0, 16383);
    const lsb = v14 & 0x7f;
    const msb = (v14 >> 7) & 0x7f;
    const bytes: number[] = [status, lsb, msb];
    this.sendSafe(appKey, out, bytes, needle);
    const xt = getGlobalXTouch();
    if (xt) scheduleFaderSetpoint(xt, channel, v14);
    if (!hasPassthroughForApp(appKey)) {
      markAppOutgoingAndForward(appKey, bytes, needle);
    }
    ensureFeedbackOpen(appKey, { inPerApp: this.inPerApp, appToInName: this.appToInName }).catch(() => {});
  }

  async ensureFeedback(app: string): Promise<void> {
    const appKey = String(app).trim();
    await ensureFeedbackOpen(appKey, { inPerApp: this.inPerApp, appToInName: this.appToInName });
  }

  reconcileForPage(page: PageConfig | undefined): void {
    try {
      if (!page) return;
      const items = (page as any).passthroughs ?? ((page as any).passthrough ? [(page as any).passthrough] : []);
      const apps = new Set<string>();
      for (const it of (items as any[])) {
        const toPort = String(it?.to_port || "");
        const fromPort = String(it?.from_port || "");
        apps.add(resolveAppKey(toPort, fromPort));
      }
      for (const [app, inp] of this.inPerApp.entries()) {
        if (apps.has(app)) {
          try { inp.closePort(); } catch {}
          this.inPerApp.delete(app);
          try { logger.info(`MidiAppClient: IN fermé pour app='${app}' (couvert par passthrough).`); } catch {}
        }
      }
      for (const [app, out] of this.outPerApp.entries()) {
        if (apps.has(app)) {
          try { out.closePort(); } catch {}
          this.outPerApp.delete(app);
          try { logger.info(`MidiAppClient: OUT fermé pour app='${app}' (couvert par passthrough).`); } catch {}
        }
      }
    } catch {}
  }

  async shutdown(): Promise<void> {
    for (const o of this.outPerApp.values()) { try { o.closePort(); } catch {} }
    this.outPerApp.clear();
    for (const i of this.inPerApp.values()) { try { i.closePort(); } catch {} }
    this.inPerApp.clear();
    for (const t of this.outRetryTimers.values()) { try { clearTimeout(t.timer); } catch {} }
    this.outRetryTimers.clear();
  }

  private async ensureOutOpen(app: string, needle: string, optional: boolean): Promise<Output | null> {
    let out = this.outPerApp.get(app) || null;
    if (out) return out;
    try {
      const o = new Output();
      const idx = findPortIndexByNameFragment(o, needle);
      if (idx == null) {
        o.closePort?.();
        if (!optional) throw new Error(`Port OUT introuvable pour '${needle}'`);
        logger.warn(`MidiAppClient: port OUT introuvable '${needle}' (optional).`);
        this.scheduleOutRetry(app, needle);
        return null;
      }
      o.openPort(idx);
      this.outPerApp.set(app, o);
      logger.info(`MidiAppClient: OUT ouvert app='${app}' via '${needle}'.`);
      // On success, cancel any pending retry
      const cur = this.outRetryTimers.get(app);
      if (cur) { try { clearTimeout(cur.timer); } catch {} this.outRetryTimers.delete(app); }
      return o;
    } catch (err) {
      if (!optional) throw err;
      logger.warn(`MidiAppClient: ouverture OUT échouée pour '${needle}':`, err as any);
      this.scheduleOutRetry(app, needle);
      return null;
    }
  }

  /**
   * Envoie un message MIDI et gère les erreurs (port débranché/indisponible).
   * En cas d'échec, ferme le port, l'enlève du cache et programme une reconnexion.
   */
  private sendSafe(app: string, out: Output, bytes: number[], needle: string): void {
    try {
      out.sendMessage(bytes);
    } catch (err) {
      logger.warn(`MidiAppClient: envoi OUT échoué vers '${needle}', tentative de reconnexion...`, err as any);
      try { out.closePort(); } catch {}
      this.outPerApp.delete(app);
      this.scheduleOutRetry(app, needle);
    }
  }

  /**
   * Programme une tentative de réouverture du port OUT pour une app avec backoff léger.
   */
  private scheduleOutRetry(app: string, needle: string): void {
    const prev = this.outRetryTimers.get(app);
    const nextCount = (prev?.count ?? 0) + 1;
    if (prev) { try { clearTimeout(prev.timer); } catch {} }
    const delay = Math.min(10_000, 250 * nextCount);
    const timer = setTimeout(() => {
      // best-effort: ensureOpen will re-plan on failure
      this.ensureOutOpen(app, needle, true).catch(() => {});
    }, delay);
    this.outRetryTimers.set(app, { count: nextCount, timer });
    try { logger.info(`MidiAppClient: RETRY OUT ${nextCount} pour app='${app}' dans ${delay}ms.`); } catch {}
  }
}

export { markAppOutgoingAndForward } from "./core";


