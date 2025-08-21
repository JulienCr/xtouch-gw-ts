import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import type { ControlMidiSpec } from "../types";
import type { AppConfig, PageConfig } from "../config";
import { findPortIndexByNameFragment } from "./ports";
import { scheduleFaderSetpoint } from "../xtouch/faderSetpoint";
import type { XTouchDriver } from "../xtouch/driver";
import { resolveAppKey } from "../shared/appKey";
import { resolvePbToCcMappingForApp } from "../router/page";

/**
 * Client partagé de gestion des ports MIDI par application (IN/OUT) et d'émission.
 *
 * - Ouvre et met en cache les ports pour chaque app déclarée dans `config.midi.apps`
 * - Émet Note/CC/Pitch Bend selon `ControlMidiSpec`
 * - Convertit automatiquement PB 14 bits → CC 7 bits quand demandé
 * - Met à jour de façon optimiste l'état (shadow) et re-route vers le Router pour anti-echo/latence
 * - Active un listener IN facultatif pour relayer le feedback des apps quand il n'existe pas déjà un passthrough
 */
export class MidiAppClient {
  private readonly outPerApp: Map<string, Output> = new Map();
  private readonly inPerApp: Map<string, Input> = new Map();
  private readonly appToOutName: Map<string, string> = new Map();
  private readonly appToInName: Map<string, string> = new Map();

  /** Initialise/rafraîchit la table des ports cibles par app depuis la config. */
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

  /** Ferme proprement les ports gérés, puis ré-applique la config. */
  async reconfigure(cfg: AppConfig): Promise<void> {
    try {
      for (const o of this.outPerApp.values()) { try { o.closePort(); } catch {} }
      for (const i of this.inPerApp.values()) { try { i.closePort(); } catch {} }
    } finally {
      this.outPerApp.clear();
      this.inPerApp.clear();
    }
    await this.init(cfg);
  }

  /** Envoie un message MIDI pour l'app donnée selon la spéc; conversions et side-effects inclus. */
  async send(app: string, spec: ControlMidiSpec, value: unknown): Promise<void> {
    const needle = this.appToOutName.get(app) || app;
    const out = await this.ensureOutOpen(app, needle, true);
    if (!out) return;

    const channel = clamp(Number(spec.channel) | 0, 1, 16);

    // Passthrough brut: `value` peut être un tableau [status, d1, d2...]
    if (spec.type === "passthrough") {
      const input = Array.isArray(value) ? (value as unknown[]) : null;
      if (input && input.length >= 1) {
        const status = (Number(input[0]) | 0) & 0xff;
        const dataBytes = input.slice(1).map((n) => clamp(Number(n) | 0, 0, 127));
        const tx: number[] = [status, ...dataBytes];
        out.sendMessage(tx);
        if (!hasPassthroughForApp(app)) {
          markAppOutgoingAndForward(app, tx, needle);
        }
        // Armer le feedback listener si pas déjà pris par un passthrough
        this.ensureFeedbackOpen(app).catch(() => {});
      }
      return;
    }

    const statusNibble = spec.type === "note" ? 0x9 : spec.type === "cc" ? 0xB : 0xE;
    const status = (statusNibble << 4) | (channel - 1);

    if (spec.type === "note") {
      const note = clamp(Number(spec.note) | 0, 0, 127);
      const vel = clamp(Number(value) | 0, 0, 127);
      const bytes: number[] = [status, note, vel];
      out.sendMessage(bytes);
      if (!hasPassthroughForApp(app)) {
        markAppOutgoingAndForward(app, bytes, needle);
      }
      this.ensureFeedbackOpen(app).catch(() => {});
      return;
    }

    if (spec.type === "cc") {
      const cc = clamp(Number(spec.cc) | 0, 0, 127);
      let v7 = 0;
      if (typeof value === "number" && Number.isFinite(value)) {
        const v = value as number;
        if (v > 127) {
          // 14b → 7b
          v7 = Math.round(clamp(v, 0, 16383) / 16383 * 127);
          // Programmer un setpoint moteur pour éviter le retour après mouvement
          const xt = getGlobalXTouch();
          if (xt) {
            // Déduire le canal fader source via le mapping CC→PB si page active connue
            let faderChannel = channel;
            try {
              const g = (global as unknown as { __router__?: { getActivePage: () => PageConfig | undefined } }).__router__;
              const page = g?.getActivePage?.();
              if (page) {
                const m = resolvePbToCcMappingForApp(page, app as any);
                const ch = m?.channelForCc?.get(cc);
                if (typeof ch === "number" && Number.isFinite(ch) && ch >= 1 && ch <= 16) {
                  faderChannel = ch;
                }
              }
            } catch {}
            scheduleFaderSetpoint(xt, faderChannel, clamp((value as number) | 0, 0, 16383));
          }
        } else {
          v7 = clamp(v | 0, 0, 127);
        }
      }
      const bytes: number[] = [status, cc, v7];
      out.sendMessage(bytes);
      if (!hasPassthroughForApp(app)) {
        markAppOutgoingAndForward(app, bytes, needle);
      }
      this.ensureFeedbackOpen(app).catch(() => {});
      return;
    }

    // Pitch Bend 14 bits
    const v14 = clamp(Number(value) | 0, 0, 16383);
    const lsb = v14 & 0x7f;
    const msb = (v14 >> 7) & 0x7f;
    const bytes: number[] = [status, lsb, msb];
    out.sendMessage(bytes);
    const xt = getGlobalXTouch();
    if (xt) scheduleFaderSetpoint(xt, channel, v14);
    if (!hasPassthroughForApp(app)) {
      markAppOutgoingAndForward(app, bytes, needle);
    }
    this.ensureFeedbackOpen(app).catch(() => {});
  }

  /** Ferme les ports IN/OUT gérés par ce client pour les apps couvertes par des passthroughs sur la page. */
  reconcileForPage(page: PageConfig | undefined): void {
    try {
      if (!page) return;
      const items = (page as any).passthroughs ?? ((page as any).passthrough ? [(page as any).passthrough] : []);
      const apps = new Set<string>();
      for (const it of (items as any[])) {
        const appKey = resolveAppKey(String(it?.to_port || ""), String(it?.from_port || ""));
        apps.add(appKey);
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

  /** Arrête et libère toutes les ressources (ports). */
  async shutdown(): Promise<void> {
    for (const o of this.outPerApp.values()) { try { o.closePort(); } catch {} }
    this.outPerApp.clear();
    for (const i of this.inPerApp.values()) { try { i.closePort(); } catch {} }
    this.inPerApp.clear();
  }

  // Internals

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
        return null;
      }
      o.openPort(idx);
      this.outPerApp.set(app, o);
      logger.info(`MidiAppClient: OUT ouvert app='${app}' via '${needle}'.`);
      return o;
    } catch (err) {
      if (!optional) throw err;
      logger.warn(`MidiAppClient: ouverture OUT échouée pour '${needle}':`, err as any);
      return null;
    }
  }

  /** Ouvre un port IN pour capter le feedback si connu et pertinent (pas de passthrough concurrent). */
  private async ensureFeedbackOpen(app: string): Promise<void> {
    if (this.inPerApp.has(app)) return;
    const needle = this.appToInName.get(app);
    if (!needle) return;
    if (hasPassthroughForApp(app) || hasPassthroughAnywhereForApp(app)) {
      logger.debug(`MidiAppClient: skip IN for app='${app}' (handled elsewhere).`);
      return;
    }
    try {
      const inp = new Input();
      const idx = findPortIndexByNameFragment(inp, needle);
      if (idx == null) {
        inp.closePort?.();
        logger.debug(`MidiAppClient: port IN introuvable '${needle}' (optional)`);
        return;
      }
      inp.ignoreTypes(false, false, false);
      inp.on("message", (_delta, data) => {
        try {
          const r = (global as unknown as { __router__?: { onMidiFromApp: (appKey: string, raw: number[], portId: string) => void } }).__router__;
          r?.onMidiFromApp?.(app, data, needle);
        } catch {}
      });
      inp.openPort(idx);
      this.inPerApp.set(app, inp);
      logger.info(`MidiAppClient: IN ouvert app='${app}' via '${needle}'.`);
    } catch (err) {
      logger.debug(`MidiAppClient: ouverture IN échouée pour app='${app}':`, err as any);
    }
  }
}

/** Marque l'envoi côté app et reboucle vers Router pour anti‑echo/latence/state. */
export function markAppOutgoingAndForward(app: string, raw: number[], portId: string): void {
  try {
    const g = (global as unknown as { __router__?: any }).__router__;
    g?.markAppShadowForOutgoing?.(app, raw, portId);
    g?.onMidiFromApp?.(app, raw, portId);
  } catch {}
}

// Helpers locaux

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getGlobalXTouch(): XTouchDriver | null {
  try {
    const g = (global as unknown as { __xtouch__?: XTouchDriver });
    return g?.__xtouch__ ?? null;
  } catch {
    return null;
  }
}

function hasPassthroughForApp(app: string): boolean {
  try {
    const g = (global as unknown as { __router__?: { getActivePage: () => any } });
    const page = g?.__router__?.getActivePage?.();
    if (!page) return false;
    const items = (page as any).passthroughs ?? ((page as any).passthrough ? [(page as any).passthrough] : []);
    for (const it of (items as any[])) {
      const appKey = resolveAppKey(String(it?.to_port || ""), String(it?.from_port || ""));
      if (appKey === app) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function hasPassthroughAnywhereForApp(app: string): boolean {
  try {
    const g = (global as unknown as { __router__?: { getPagesMerged: () => any[] } });
    const pages = g?.__router__?.getPagesMerged?.();
    if (!Array.isArray(pages)) return false;
    for (const p of pages) {
      const items = (p as any).passthroughs ?? ((p as any).passthrough ? [(p as any).passthrough] : []);
      for (const it of (items as any[])) {
        const appKey = resolveAppKey(String(it?.to_port || ""), String(it?.from_port || ""));
        if (appKey === app) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}


