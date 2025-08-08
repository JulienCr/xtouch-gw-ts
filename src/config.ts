import { promises as fs } from "fs";
import path from "path";
import YAML from "yaml";
import chokidar from "chokidar";

export interface PagingConfig {
  channel?: number; // défaut 1
  prev_note?: number; // défaut 46
  next_note?: number; // défaut 47
}

export interface PageConfig {
  name: string;
  passthrough?: {
    driver: string; // "midi" | "voicemeeter" | etc.
    to_port: string; // vers appli cible (ex: "xtouch-gw")
    from_port: string; // feedback depuis appli (ex: "xtouch-gw-feedback")
  };
  controls: Record<string, unknown>;
}

export interface AppConfig {
  midi: {
    input_port: string;
    output_port: string;
  };
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