import { promises as fs } from "fs";
import path from "path";
import YAML from "yaml";
import chokidar from "chokidar";

export interface PagingConfig {
  channel?: number; // défaut 1
  prev_note?: number; // défaut 46
  next_note?: number; // défaut 47
}

export interface FeaturesConfig {
  vm_sync?: boolean; // true par défaut; si false, désactive la synchronisation Voicemeeter
}

export type MidiEventTypeName =
  | "noteOn"
  | "noteOff"
  | "controlChange"
  | "programChange"
  | "channelAftertouch"
  | "polyAftertouch"
  | "pitchBend";

export interface MidiFilterConfig {
  channels?: number[]; // 1..16
  types?: MidiEventTypeName[]; // types autorisés (si défini)
  includeNotes?: number[]; // si défini, ne laisser passer que ces notes (pour noteOn/noteOff)
  excludeNotes?: number[]; // si défini, bloquer ces notes (pour noteOn/noteOff)
}

export interface PassthroughConfig {
  driver: string; // "midi" | "voicemeeter" | etc.
  to_port: string; // vers appli cible (ex: "xtouch-gw")
  from_port: string; // feedback depuis appli (ex: "xtouch-gw-feedback")
  filter?: MidiFilterConfig; // filtre coté XTouch -> target
  optional?: boolean; // si true, ignore proprement si ports absents
  transform?: TransformConfig; // transformations des messages sortants vers la cible
}

export interface TransformConfig {
  /**
   * Convertit les messages Pitch Bend (14 bits) en Note On sur le même canal, avec vélocité mappée 0..127.
   * Utile pour QLC+ qui ne gère pas Pitch Bend.
   */
  pb_to_note?: {
    /**
     * Numéro de note à utiliser (0..127). Par défaut 0 si non fourni.
     */
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
    base_cc?: number | string; // accepte décimal (ex: 69) ou hex (ex: "0x45" ou "45h")
    /**
     * Mapping explicite: priorité sur base_cc si défini.
     * Ex: { 1: 46, 2: 47, 4: 49 }
     */
    cc_by_channel?: Record<number, number | string>; // valeurs acceptent décimal ou hex
  };
}

export interface PageConfig {
  name: string;
  passthrough?: PassthroughConfig; // compat: une seule entrée
  passthroughs?: PassthroughConfig[]; // préféré: plusieurs entrées
  controls: Record<string, unknown>;
  /**
   * Configuration des LCD de la X-Touch pour cette page.
   */
  lcd?: {
    /**
     * Libellés des 8 écrans LCD (index 0..7). Chaque entrée peut être:
     * - une chaîne (ligne du haut seulement)
     * - un objet { upper, lower } pour deux lignes
     */
    labels?: Array<string | { upper?: string; lower?: string }>;
    /**
     * Couleurs LCD (0..7) pour chaque strip, longueur 8.
     * Valeurs acceptées: nombre (0..7) ou chaîne convertible en nombre.
     */
    colors?: Array<number | string>;
  };
}

export interface AppConfig {
  midi: {
    input_port: string;
    output_port: string;
  };
  features?: FeaturesConfig;
  paging?: PagingConfig;
  pages: Array<PageConfig>;
}

const DEFAULT_PATHS = ["config.yaml", path.join("config", "config.yaml")];

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

export async function loadConfig(filePath?: string): Promise<AppConfig> {
  const p = (await findConfigPath(filePath)) ?? null;
  if (!p) {
    throw new Error("Aucun fichier de configuration trouvé (config.yaml)");
  }
  const raw = await fs.readFile(p, "utf8");
  return YAML.parse(raw) as AppConfig;
}

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