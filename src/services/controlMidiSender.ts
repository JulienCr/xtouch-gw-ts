import { Input, Output } from "@julusian/midi";
import type { AppConfig, PageConfig } from "../config";
import type { ControlMidiSpec } from "../types";
import { findPortIndexByNameFragment } from "../midi/ports";
import { logger } from "../logger";
import { scheduleFaderSetpoint } from "../xtouch/faderSetpoint";
import type { XTouchDriver } from "../xtouch/driver";
import { resolveAppKey } from "../shared/appKey";
import { resolvePbToCcMappingForApp } from "../router/page";

/**
 * Gestionnaire global d'émission MIDI pour les mappings de `controls.*.midi`.
 *
 * - Ouvre et met en cache les ports sortants vers les apps connues
 * - Convertit automatiquement les valeurs 14 bits (Pitch Bend) vers 7 bits pour les CC
 * - Envoie des trames Note On, Control Change ou Pitch Bend selon la spécification
 */
class ControlMidiSenderImpl {
  private outPerApp: Map<string, Output> = new Map();
  private appToOutName: Map<string, string> = new Map();
  private inPerApp: Map<string, Input> = new Map();
  private appToInName: Map<string, string> = new Map();

  /**
   * Initialise le service (pré‑ouverture best‑effort des ports connus).
   * @param cfg Configuration applicative courante
   */
  async init(cfg: AppConfig): Promise<void> {
    // Heuristiques par app pour choisir le port de sortie cible
    // - voicemeeter: utiliser le port "xtouch-gw" (bridge VM) si présent
    // - qlc: utiliser le port contenant "qlc-in"
    // - obs: généralement pas d'entrée MIDI → pas d'ouverture par défaut
    // Ces valeurs peuvent être raffinées plus tard (config globale optionnelle)
    this.appToOutName.set("voicemeeter", "xtouch-gw");
    this.appToOutName.set("qlc", "qlc-in");
    this.appToOutName.set("obs", "obs"); // prob. non utilisé

    // Heuristiques pour port d'entrée (feedback) par app
    this.appToInName.set("voicemeeter", "xtouch-gw-feedback");
    this.appToInName.set("qlc", "qlc-out");
    this.appToInName.set("obs", "obs"); // pas d'entrée MIDI standard
  }

  /**
   * S'assure que le port OUT associé à une app est ouvert.
   * @param app Clé d'application (ex: "qlc", "voicemeeter")
   * @param needle Sous-chaîne à rechercher dans le nom du port OUT
   * @param optional Si false, jette une erreur si le port n'est pas trouvé
   */
  private async ensureOpen(app: string, needle: string, optional: boolean): Promise<Output | null> {
    let out = this.outPerApp.get(app) || null;
    if (out) return out;
    try {
      const o = new Output();
      const idx = findPortIndexByNameFragment(o, needle);
      if (idx == null) {
        o.closePort?.();
        if (!optional) throw new Error(`Port OUT introuvable pour '${needle}'`);
        logger.warn(`ControlMidi: port OUT introuvable '${needle}' (optional).`);
        return null;
      }
      o.openPort(idx);
      this.outPerApp.set(app, o);
      logger.info(`ControlMidi: OUT ouvert pour app='${app}' via '${needle}'.`);
      return o;
    } catch (err) {
      if (!optional) throw err;
      logger.warn(`ControlMidi: ouverture OUT échouée pour '${needle}':`, err as any);
      return null;
    }
  }

  /**
   * Ouvre (lazy) un port d'entrée pour capter le feedback de l'app si connu, et le relaye au Router.
   */
  private async ensureFeedbackOpen(app: string): Promise<void> {
    if (this.inPerApp.has(app)) return;
    const needle = this.appToInName.get(app);
    if (!needle) return;
    // MODIF: ne pas ouvrir si la page active ou n'importe quelle page possède un passthrough pour cette app
    if (hasPassthroughForApp(app) || hasPassthroughAnywhereForApp(app)) {
      logger.debug(`ControlMidi: skip IN for app='${app}' (handled by passthrough/background).`);
      return;
    }
    try {
      const inp = new Input();
      const idx = findPortIndexByNameFragment(inp, needle);
      if (idx == null) {
        inp.closePort?.();
        logger.debug(`ControlMidi: port IN introuvable '${needle}' (optional)`);
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
      logger.info(`ControlMidi: IN ouvert pour app='${app}' via '${needle}'.`);
    } catch (err) {
      logger.debug(`ControlMidi: ouverture IN échouée pour app='${app}':`, err as any);
    }
  }

  /**
   * Ferme les entrées feedback ouvertes par ce service pour les apps gérées par des passthroughs sur la page.
   */
  reconcileForPage(page: PageConfig | undefined): void {
    try {
      if (!page) return;
      const items = (page as any).passthroughs ?? ((page as any).passthrough ? [(page as any).passthrough] : []);
      const apps = new Set<string>();
      for (const it of (items as any[])) {
        const appKey = resolveAppKey(String(it?.to_port || ""), String(it?.from_port || ""));
        apps.add(appKey);
      }
      // Fermer IN et OUT appartenant à control-midi pour les apps gérées par des passthroughs
      for (const [app, inp] of this.inPerApp.entries()) {
        if (apps.has(app)) {
          try { inp.closePort(); } catch {}
          this.inPerApp.delete(app);
          try { logger.info(`ControlMidi: IN fermé pour app='${app}' (pris en charge par passthrough).`); } catch {}
        }
      }
      for (const [app, out] of this.outPerApp.entries()) {
        if (apps.has(app)) {
          try { out.closePort(); } catch {}
          this.outPerApp.delete(app);
          try { logger.info(`ControlMidi: OUT fermé pour app='${app}' (pris en charge par passthrough).`); } catch {}
        }
      }
    } catch {}
  }

  /**
   * Envoie un message MIDI selon la spéc de contrôle.
   * @param app Clé app destinataire (détermine le port OUT)
   * @param spec Spécification MIDI (type/ch/cc/note)
   * @param value Valeur (0..127 pour CC/Note, 0..16383 pour PB). Les valeurs >127 sont converties en 7 bits pour CC.
   */
  async send(app: string, spec: ControlMidiSpec, value: unknown): Promise<void> {
    const needle = this.appToOutName.get(app) || app;
    const out = await this.ensureOpen(app, needle, true);
    if (!out) return;

    const channel = Math.max(1, Math.min(16, (spec.channel | 0) || 1));
    const statusNibble = spec.type === "note" ? 0x9 : spec.type === "cc" ? 0xB : 0xE;
    const status = (statusNibble << 4) | (channel - 1);

    if (spec.type === "note") {
      const note = Math.max(0, Math.min(127, (spec.note ?? 0) | 0));
      const vel = Math.max(0, Math.min(127, Number(value) | 0));
      const bytes: number[] = [status, note, vel];
      out.sendMessage(bytes);
      // Optimistic state/shadow update si aucun passthrough pour cette app
      if (!hasPassthroughForApp(app)) {
        try {
          const g = (global as unknown as { __router__?: any });
          g.__router__?.markAppShadowForOutgoing?.(app, bytes, needle);
          g.__router__?.onMidiFromApp?.(app, bytes, needle);
        } catch {}
      }
      // S'assurer d'écouter le feedback pour cette app
      this.ensureFeedbackOpen(app).catch(() => {});
      return;
    }
    if (spec.type === "cc") {
      const cc = Math.max(0, Math.min(127, (spec.cc ?? 0) | 0));
      // Accepte soit valeur 7‑bits, soit 14‑bits (PB) → convertit en 7b
      let v7 = 0;
      if (typeof value === "number" && Number.isFinite(value)) {
        const v = value as number;
        if (v > 127) {
          // 14‑bits → 7‑bits
          v7 = Math.round(Math.max(0, Math.min(16383, v)) / 16383 * 127);
          // Programmer aussi un setpoint moteur pour éviter le « retour » après mouvement
          const xt = getGlobalXTouch();
          if (xt) {
            // En MCU, le canal CC cible (souvent CH1 pour QLC) n'est pas le canal du fader source.
            // Déduire le canal fader depuis la page active via le mapping CC→PB s'il est disponible.
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
            scheduleFaderSetpoint(xt, faderChannel, Math.max(0, Math.min(16383, v | 0)));
          }
        } else {
          v7 = Math.max(0, Math.min(127, v | 0));
        }
      }
      const bytes: number[] = [status, cc, v7];
      out.sendMessage(bytes);
      // Optimistic state/shadow update si aucun passthrough pour cette app
      if (!hasPassthroughForApp(app)) {
        try {
          const g = (global as unknown as { __router__?: any });
          g.__router__?.markAppShadowForOutgoing?.(app, bytes, needle);
          g.__router__?.onMidiFromApp?.(app, bytes, needle);
        } catch {}
      }
      // S'assurer d'écouter le feedback pour cette app
      this.ensureFeedbackOpen(app).catch(() => {});
      return;
    }
    // PB
    const v14 = Math.max(0, Math.min(16383, Number(value) | 0));
    const lsb = v14 & 0x7f;
    const msb = (v14 >> 7) & 0x7f;
    const bytes: number[] = [status, lsb, msb];
    out.sendMessage(bytes);
    // Programmer setpoint moteur sur PB direct
    const xt = getGlobalXTouch();
    if (xt) scheduleFaderSetpoint(xt, channel, v14);
    // Optimistic state/shadow update si aucun passthrough pour cette app
    if (!hasPassthroughForApp(app)) {
      try {
        const g = (global as unknown as { __router__?: any });
        g.__router__?.markAppShadowForOutgoing?.(app, bytes, needle);
        g.__router__?.onMidiFromApp?.(app, bytes, needle);
      } catch {}
    }
    // S'assurer d'écouter le feedback pour cette app
    this.ensureFeedbackOpen(app).catch(() => {});
  }

  /**
   * Ferme tous les ports OUT ouverts par le service.
   */
  async shutdown(): Promise<void> {
    for (const o of this.outPerApp.values()) {
      try { o.closePort(); } catch {}
    }
    this.outPerApp.clear();
    for (const i of this.inPerApp.values()) {
      try { i.closePort(); } catch {}
    }
    this.inPerApp.clear();
  }
}

const ControlMidiSender = new ControlMidiSenderImpl();

// MODIF: helper typé pour récupérer le driver X‑Touch exposé globalement si présent
function getGlobalXTouch(): XTouchDriver | null {
  try {
    const g = (global as unknown as { __xtouch__?: XTouchDriver });
    return g?.__xtouch__ ?? null;
  } catch {
    return null;
  }
}

// MODIF: détecte s'il existe des passthroughs actifs pour une app donnée (évite double écoute IN)
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

// MODIF: détecte s'il existe des passthroughs sur n'importe quelle page (utiles pour listeners background)
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

/**
 * Initialise le service global d'émission MIDI.
 */
export async function initControlMidiSender(cfg: AppConfig): Promise<void> {
  await ControlMidiSender.init(cfg);
  // MODIF: exposer pour orchestration (reconcile on page change)
  try { (global as any).__controlMidiSender__ = ControlMidiSender; } catch {}
}

/**
 * Envoie un message MIDI en utilisant la configuration de contrôle.
 */
export async function sendControlMidi(app: string, spec: ControlMidiSpec, value: unknown): Promise<void> {
  await ControlMidiSender.send(app, spec, value);
}

/**
 * Arrête le service global d'émission MIDI et libère les ports.
 */
export async function shutdownControlMidiSender(): Promise<void> {
  await ControlMidiSender.shutdown();
  try { delete (global as any).__controlMidiSender__; } catch {}
}


