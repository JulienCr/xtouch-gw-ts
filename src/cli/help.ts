import fs from "fs";
import path from "path";
import YAML from "yaml";

export interface HelpEntry {
  command: string;
  options?: string;
  description?: string;
}

export interface HelpSpec {
  commands: HelpEntry[];
}

/**
 * Charger la spécification d'aide CLI depuis `help.yaml` (dans le même dossier).
 */
export function loadHelpSpec(): HelpSpec {
  const filePath = path.resolve(__dirname, "help.yaml");
  const raw = fs.readFileSync(filePath, { encoding: "utf8" });
  const spec = YAML.parse(raw) as HelpSpec;
  if (!spec || !Array.isArray(spec.commands)) {
    throw new Error("help.yaml invalide: attendu { commands: [...] }");
  }
  return spec;
}

/**
 * Rendre un tableau 3 colonnes (commande | options | description) sur stdout.
 * - Sans logger (affichage direct)
 * - Largeurs de colonnes auto avec bornes raisonnables
 */
export function printHelp(spec: HelpSpec): void {
  const rows = spec.commands.map((c) => [c.command || "", c.options || "", c.description || ""]); 

  const headers = ["commande", "options", "description"];
  rows.unshift(headers);

  // Calcul des largeurs max par colonne
  const colWidths = [0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < 3; i++) {
      const len = String(row[i] ?? "").length;
      if (len > colWidths[i]) colWidths[i] = len;
    }
  }
  // Bornes: éviter une colonne description énorme sur une seule ligne de terminal
  colWidths[0] = Math.min(Math.max(colWidths[0], 7), 28); // commande
  colWidths[1] = Math.min(Math.max(colWidths[1], 6), 28); // options
  // description: laisser libre, pas de borne max pour conserver la lisibilité

  // Séparateur
  const sep = `-${"-".repeat(colWidths[0])}-+-${"-".repeat(colWidths[1])}-+-${"-".repeat(11)}-`;

  // Affichage
  for (let r = 0; r < rows.length; r++) {
    const [c0, c1, c2] = rows[r];
    const line = pad(c0, colWidths[0]) + " | " + pad(c1, colWidths[1]) + " | " + (c2 ?? "");
    if (r === 0) {
      // header
      process.stdout.write(line + "\n");
      process.stdout.write(sep + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }
}

function pad(value: string, width: number): string {
  const s = String(value ?? "");
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}


