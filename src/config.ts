import { promises as fs } from "fs";
import path from "path";
import YAML from "yaml";
import chokidar from "chokidar";

/**
 * Configuration de la pagination (navigation entre pages) depuis la X‑Touch.
 */
export interface PagingConfig {
  /** Canal MIDI à utiliser pour les notes Prev/Next (défaut: 1) */
  channel?: number;
  /** Note MIDI pour la navigation vers la page précédente (défaut: 46) */
  prev_note?: number;
  /** Note MIDI pour la navigation vers la page suivante (défaut: 47) */
  next_note?: number;
}

 

/** Mode de l'X‑Touch: MCU (pitch bend pour faders) ou CTRL (CC pour faders). */
export type XTouchMode = "mcu" | "ctrl";

/** Configuration spécifique à l'X‑Touch. */
export interface XTouchConfig {
  /** Mode de fonctionnement. Défaut: "mcu" */
  mode?: XTouchMode;
  /** Options d'affichage de la valeur sur les LCD lors d'un mouvement de fader. */
  overlay?: {
    /** Activer l'overlay de valeur en bas du strip LCD pendant le touch. Défaut: true */
    enabled?: boolean;
    /** Affichage pour CC (7 bits): "7bit" (0..127) ou "8bit" (0..255). Défaut: "7bit" */
    cc_bits?: "7bit" | "8bit";
  };
  /**
   * Défauts d'overlay par application (override du fallback global; override par contrôle prioritaire).
   * Exemple:
   *   overlay_per_app: { qlc: { mode: "8bit" }, voicemeeter: { mode: "percent" } }
   */
  overlay_per_app?: Record<string, { enabled?: boolean; mode?: "percent" | "7bit" | "8bit" }>;
}

/**
 * Noms des types d'événements MIDI supportés par les filtres.
 */
export type MidiEventTypeName =
  | "noteOn"
  | "noteOff"
  | "controlChange"
  | "programChange"
  | "channelAftertouch"
  | "polyAftertouch"
  | "pitchBend";

/**
 * Filtre applicables aux messages MIDI sortants vers une application cible.
 */
export interface MidiFilterConfig {
  /** Canaux autorisés (1..16) */
  channels?: number[];
  /** Types d'événements autorisés (si défini) */
  types?: MidiEventTypeName[];
  /** N'autoriser que ces notes (pour noteOn/noteOff) */
  includeNotes?: number[];
  /** Bloquer ces notes (pour noteOn/noteOff) */
  excludeNotes?: number[];
}

/**
 * Décrit un pont (passthrough) entre la X‑Touch et une application cible.
 */
export interface PassthroughConfig {
  /** Type de driver cible (ex: "midi", "voicemeeter") */
  driver: string;
  /** Nom du port de sortie (vers l'application cible) */
  to_port: string;
  /** Nom du port d'entrée (feedback depuis l'application) */
  from_port: string;
  /** Filtre appliqué aux messages sortants vers la cible */
  filter?: MidiFilterConfig;
  /** Si true, ignorer proprement si les ports n'existent pas */
  optional?: boolean;
  /** Transformations à appliquer aux messages sortants */
  transform?: TransformConfig;
}

/**
 * Transformations applicables aux messages MIDI sortants.
 */
export interface TransformConfig {
  /**
   * Convertit les messages Pitch Bend (14 bits) en Note On sur le même canal, avec vélocité mappée 0..127.
   * Utile pour QLC+ qui ne gère pas Pitch Bend.
   */
  pb_to_note?: {
    /** Numéro de note à utiliser (0..127). Par défaut 0 si non fourni. */
    note?: number;
  };

  /**
   * Convertit les messages Pitch Bend (14 bits) en Control Change, avec valeur 0..127.
   * Permet de cibler un canal fixe et un contrôleur dépendant du canal source.
   */
  pb_to_cc?: {
    /** Canal cible (1..16). Défaut: 1 */
    target_channel?: number;
    /**
     * CC de base: CC = base_cc + (channel_source - 1).
     * Exemple: base_cc=45 → ch1→46, ch2→47, ch3→48, ch4→49, etc.
     * Défaut: 45 pour coller à l'exemple utilisateur.
     */
    base_cc?: number | string;
    /** Mapping explicite prioritaire si défini. Ex: { 1: 46, 2: 47, 4: 49 } */
    cc_by_channel?: Record<number, number | string>;
  };
}

/**
 * Décrit une page de contrôle X‑Touch: nom, ponts, contrôles et LCD.
 */
export interface PageConfig {
  /** Nom lisible de la page */
  name: string;
  /** Pont unique (compatibilité) */
  passthrough?: PassthroughConfig;
  /** Liste de ponts (préféré) */
  passthroughs?: PassthroughConfig[];
  /** Définition des contrôles (spécifique aux apps) */
  controls: Record<string, unknown>;
  /** Configuration des LCD de la X‑Touch pour cette page. */
  lcd?: {
    /** Libellés des 8 LCD (haut seulement ou {upper,lower}) */
    labels?: Array<string | { upper?: string; lower?: string }>;
    /** Couleurs LCD par strip (0..7) */
    colors?: Array<number | string>;
  };
}

/**
 * Valeurs par défaut globales appliquées à toutes les pages (surchargées par la page).
 * Permet de définir des `controls`, `lcd` ou `passthrough(s)` communs.
 */
export interface GlobalPageDefaults {
  /** Définition des contrôles communs à toutes les pages */
  controls?: Record<string, unknown>;
  /** LCD commun (labels/couleurs) — si non défini par la page */
  lcd?: {
    labels?: Array<string | { upper?: string; lower?: string }>;
    colors?: Array<number | string>;
  };
  /** Pont unique par défaut (si la page n'en définit pas) */
  passthrough?: PassthroughConfig;
  /** Liste de ponts par défaut (si la page n'en définit pas) */
  passthroughs?: PassthroughConfig[];
}

/**
 * Configuration racine de l'application.
 */
export interface AppConfig {
  /** Ports MIDI X‑Touch */
  midi: {
    input_port: string;
    output_port: string;
    /** Mapping explicite des ports par application (override des heuristiques) */
    apps?: Array<{
      /** Clé d'application (ex: "voicemeeter", "qlc", "obs") */
      name: string;
      /** Nom du port de sortie (vers l'application) */
      output_port?: string;
      /** Nom du port d'entrée (feedback depuis l'application) */
      input_port?: string;
    }>;
  };
  /** Paramètres de connexion à OBS WebSocket. */
  obs?: {
    host?: string;
    port?: number;
    password?: string;
  };
  /** Configuration Gamepad (Windows XInput) */
  gamepad?: {
    /** Activer l'entrée manette */
    enabled?: boolean;
    /** Provider à utiliser ("hid" recommandé) */
    provider?: "xinput" | "hid";
    /** Index du device XInput (0..3) */
    device_index?: number;
    /** Deadzone pour axes (0..1, défaut 0.15) */
    deadzone?: number;
    /** Fréquence d'échantillonnage (Hz, défaut 60) */
    sample_hz?: number;
    /** Seuil de déclenchement pour ZL/ZR (0..1, défaut 0.5) */
    trigger_threshold?: number;
    /** Options spécifiques HID */
    hid?: {
      /** Correspondance produit/manufacturer (substring) */
      product_match?: string;
      /** VID/PID explicites */
      vendor_id?: number;
      product_id?: number;
      /** Chemin explicite (Windows) */
      path?: string;
      /** Fichier CSV de mapping (voir script de calibration) */
      mapping_csv?: string;
    };
    /** Réglages analogiques (facultatif) */
    analog?: {
      /** Gain de pan (px/tick à v=1, step=1) — défaut 15 */
      pan_gain?: number;
      /** Gain de zoom (échelle/tick à v=1, base=1) — défaut 3 */
      zoom_gain?: number;
      /** Deadzone analogique (0..1) — défaut 0.02 */
      deadzone?: number;
      /** Gamma (courbe de réponse) — défaut 1.5 */
      gamma?: number;
    };
  };
  /** Configuration X‑Touch (mode, etc.) */
  xtouch?: XTouchConfig;
  /** Navigation entre pages */
  paging?: PagingConfig;
  /** Valeurs par défaut appliquées à toutes les pages (merge/surcharge) */
  pages_global?: GlobalPageDefaults;
  /** Liste des pages définies */
  pages: Array<PageConfig>;
}

const DEFAULT_PATHS = ["config.yaml", path.join("config", "config.yaml")];

/**
 * Recherche un fichier de configuration existant parmi les chemins par défaut ou un chemin fourni.
 * @param customPath Chemin explicite à tester en priorité
 * @returns Le chemin trouvé ou null
 */
export async function findConfigPath(customPath?: string): Promise<string | null> {
  const candidates = customPath ? [customPath, ...DEFAULT_PATHS] : DEFAULT_PATHS;
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Charge et parse le fichier YAML de configuration.
 * @param filePath Chemin explicite; sinon, recherche via {@link findConfigPath}
 * @throws Erreur si aucun fichier n'est trouvé
 */
export async function loadConfig(filePath?: string): Promise<AppConfig> {
  const p = (await findConfigPath(filePath)) ?? null;
  if (!p) {
    throw new Error("Aucun fichier de configuration trouvé (config.yaml)");
  }
  const raw = await fs.readFile(p, "utf8");
  return YAML.parse(raw) as AppConfig;
}

/**
 * Observe un fichier de configuration YAML et notifie en cas de modification.
 * @param filePath Chemin du fichier à surveiller
 * @param onChange Callback appelée avec la nouvelle configuration
 * @param onError Callback d'erreur facultative
 * @returns Fonction pour arrêter l'observation
 */
export function watchConfig(
  filePath: string,
  onChange: (cfg: AppConfig) => void,
  onError?: (err: unknown) => void
): () => void {
  const watcher = chokidar.watch(filePath, { ignoreInitial: true });
  const handler = async () => {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const cfg = YAML.parse(raw) as AppConfig;
      onChange(cfg);
    } catch (err) {
      onError?.(err);
    }
  };
  watcher.on("change", handler);
  return () => void watcher.close();
} 
