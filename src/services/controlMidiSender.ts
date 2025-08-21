import type { AppConfig, PageConfig } from "../config";
import type { ControlMidiSpec } from "../types";
import { MidiAppClient } from "../midi/appClient";

/**
 * Gestionnaire global d'émission MIDI pour les mappings de `controls.*.midi`.
 *
 * - Ouvre et met en cache les ports sortants vers les apps connues
 * - Convertit automatiquement les valeurs 14 bits (Pitch Bend) vers 7 bits pour les CC
 * - Envoie des trames Note On, Control Change ou Pitch Bend selon la spécification
 */
class ControlMidiSenderImpl {
  // délègue au client partagé
  private readonly client = new MidiAppClient();

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
}

const ControlMidiSender = new ControlMidiSenderImpl();

/**
 * Initialise le service global d'émission MIDI.
 */
export async function initControlMidiSender(cfg: AppConfig): Promise<void> {
  await ControlMidiSender.init(cfg);
  // exposer pour orchestration (reconcile on page change)
  try { (global as any).__controlMidiSender__ = ControlMidiSender; } catch {}
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
  try { delete (global as any).__controlMidiSender__; } catch {}
}


