import type { AppConfig, PageConfig } from "../config";
import type { ControlMidiSpec } from "../types";
import type { Router } from "../router";
import type { XTouchDriver } from "../xtouch/driver";
import { MidiAppClient } from "../midi/appClient";
import type { MidiClientHooks } from "../midi/appClient/hooks";
import { resolveAppKey } from "../shared/appKey";
import { scheduleFaderSetpoint } from "../xtouch/faderSetpoint";

/**
 * Gestionnaire global d'émission MIDI pour les mappings de `controls.*.midi`.
 *
 * - Ouvre et met en cache les ports sortants vers les apps connues
 * - Convertit automatiquement les valeurs 14 bits (Pitch Bend) vers 7 bits pour les CC
 * - Envoie des trames Note On, Control Change ou Pitch Bend selon la spécification
 */
class ControlMidiSenderImpl {
  // délègue au client partagé (infra MIDI)
  private readonly client: MidiAppClient;
  private router?: Router;
  private xtouch: XTouchDriver | null = null;

  constructor() {
    const hooks: MidiClientHooks = {
      onOutgoing: (app, bytes, portId) => {
        try {
          this.router?.markAppShadowForOutgoing?.(app, bytes, portId);
          this.router?.onMidiFromApp?.(app, bytes, portId);
        } catch {}
      },
      onFeedback: (app, raw, portId) => {
        try { this.router?.onMidiFromApp?.(app, raw, portId); } catch {}
      },
      shouldForwardOutgoing: (app) => !this.hasActivePagePassthroughForApp(app),
      shouldOpenFeedback: (app) => !this.hasAnyPagePassthroughForApp(app),
      onPitchBendSent: (channel, value14) => {
        try { if (this.xtouch) scheduleFaderSetpoint(this.xtouch, channel, value14); } catch {}
      },
    };
    this.client = new MidiAppClient(hooks);
  }

  setRouter(router: Router): void {
    this.router = router;
  }

  setXTouch(x: XTouchDriver | null): void {
    this.xtouch = x;
  }

  /**
   * Initialise le service (pré‑ouverture best‑effort des ports connus).
   * @param cfg Configuration applicative courante
   */
  async init(cfg: AppConfig): Promise<void> {
    await this.client.init(cfg);
    // Pré-ouvrir les entrées de feedback pour les apps connues afin de
    // capter immédiatement les états (ex. Voicemeeter) sans attendre un envoi.
    try {
      const apps = (cfg?.midi?.apps ?? [])
        .map((it: any) => String(it?.name || "").trim())
        .filter((s: string) => !!s);
      for (const app of apps) {
        try { await (this.client as any).ensureFeedback(app); } catch {}
      }
    } catch {}
  }

  /**
   * Réapplique la configuration et redémarre proprement les ports ouverts par ce service.
   */
  async reconfigure(cfg: AppConfig): Promise<void> { await this.client.reconfigure(cfg); }

  /**
   * S'assure que le port OUT associé à une app est ouvert.
   * @param app Clé d'application (ex: "qlc", "voicemeeter")
   * @param needle Sous-chaîne à rechercher dans le nom du port OUT
   * @param optional Si false, jette une erreur si le port n'est pas trouvé
   */


  /**
   * Ferme les entrées feedback ouvertes par ce service pour les apps gérées par des passthroughs sur la page.
   */
  reconcileForPage(page: PageConfig | undefined): void { this.client.reconcileForPage(page); }

  /**
   * Envoie un message MIDI selon la spéc de contrôle.
   * @param app Clé app destinataire (détermine le port OUT)
   * @param spec Spécification MIDI (type/ch/cc/note)
   * @param value Valeur (0..127 pour CC/Note, 0..16383 pour PB). Les valeurs >127 sont converties en 7 bits pour CC.
   */
  async send(app: string, spec: ControlMidiSpec, value: unknown): Promise<void> { await this.client.send(app, spec, value); }

  /**
   * S'assure que l'entrée feedback de l'app est ouverte (best‑effort, noop si passthrough actif ailleurs).
   * Utile pour forcer l'écoute au démarrage sans attendre un premier envoi.
   */
  async ensureFeedback(app: string): Promise<void> { await (this.client as any).ensureFeedback(app); }

  /**
   * Ferme tous les ports OUT ouverts par le service.
   */
  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }

  private hasActivePagePassthroughForApp(app: string): boolean {
    try {
      const page = this.router?.getActivePage?.();
      const items = (page?.passthroughs ?? (page?.passthrough ? [page?.passthrough] : [])) as any[];
      for (const it of items) {
        const appKey = resolveAppKey(String(it?.to_port || ""), String(it?.from_port || ""));
        if (appKey === app) return true;
      }
      return false;
    } catch { return false; }
  }

  private hasAnyPagePassthroughForApp(app: string): boolean {
    try {
      const pages = this.router?.getPagesMerged?.();
      if (!Array.isArray(pages)) return false;
      for (const p of pages) {
        const items = (p as any).passthroughs ?? ((p as any).passthrough ? [(p as any).passthrough] : []);
        for (const it of (items as any[])) {
          const appKey = resolveAppKey(String(it?.to_port || ""), String(it?.from_port || ""));
          if (appKey === app) return true;
        }
      }
      return false;
    } catch { return false; }
  }
}

const ControlMidiSender = new ControlMidiSenderImpl();

/**
 * Initialise le service global d'émission MIDI.
 */
export async function initControlMidiSender(cfg: AppConfig, deps: { router: Router }): Promise<void> {
  ControlMidiSender.setRouter(deps.router);
  await ControlMidiSender.init(cfg);
}

/** Met à jour les ports par app à partir d’une nouvelle config (hot reload). */
export async function updateControlMidiSenderConfig(cfg: AppConfig): Promise<void> {
  await ControlMidiSender.reconfigure(cfg);
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
}

// API de façade
export function setControlMidiSenderXTouch(x: XTouchDriver | null): void {
  ControlMidiSender.setXTouch(x);
}

export function reconcileControlMidiSenderForPage(page: PageConfig | undefined): void {
  ControlMidiSender.reconcileForPage(page);
}


