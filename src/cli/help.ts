import fs from "fs";
import path from "path";
import YAML from "yaml";
import chalk from "chalk";
import { levenshtein } from "./levenshtein";

/**
 * v1 (legacy) entry used to transform old YAML to v2.
 */
export interface HelpEntryV1 {
  command: string;
  options?: string;
  description?: string;
}

/**
 * v2 help schema — meta/context/categories.
 */
export interface HelpSpecV2Meta {
  program: string;
  version?: string;
  usage?: string;
  legend?: string[];
}

export interface HelpSpecV2Context {
  show?: boolean;
  items?: string[];
}

export interface HelpSpecV2Command {
  id: string;
  name: string;
  usage?: string;
  description?: string;
  danger?: boolean;
  notes?: string[];
  examples?: string[];
  aliases?: string[];
}

export interface HelpSpecV2Category {
  id: string;
  title: string;
  commands: HelpSpecV2Command[];
}

export interface HelpSpecV2 {
  meta?: HelpSpecV2Meta;
  context?: HelpSpecV2Context;
  categories: HelpSpecV2Category[];
}

export interface HelpSpecV1Wrapper {
  commands: HelpEntryV1[];
}

/**
 * Runtime context used for context header interpolation.
 */
export interface HelpRuntimeContext {
  configPath?: string;
  pageActive?: string;
  midiIn?: string;
  midiOut?: string;
  logLevel?: string;
  modes?: string;
  nowIso?: string;
}

/**
 * Charger la spécification d'aide (v2) depuis `help.yaml`.
 * Supporte v1 (legacy) et la transforme en v2 minimale.
 */
export function loadHelpSpec(): HelpSpecV2 {
  const filePath = path.resolve(__dirname, "help.yaml");
  const raw = fs.readFileSync(filePath, { encoding: "utf8" });
  const anySpec = YAML.parse(raw) as any;
  if (!anySpec) throw new Error("help.yaml invalide");

  if (Array.isArray((anySpec as HelpSpecV1Wrapper).commands)) {
    // v1 → v2 transformation (catégorie Divers)
    const v1 = anySpec as HelpSpecV1Wrapper;
    const category: HelpSpecV2Category = {
      id: "misc",
      title: "Divers",
      commands: v1.commands.map((c) => ({
        id: (c.command || "").replace(/\s+/g, "-"),
        name: c.command || "",
        usage: [c.command, c.options].filter(Boolean).join(" ").trim(),
        description: c.description || "",
      })),
    };
    return { meta: { program: "xtouch-gw" }, categories: [category] };
  }

  // v2
  const spec = anySpec as HelpSpecV2;
  if (!spec.categories || !Array.isArray(spec.categories)) {
    throw new Error("help.yaml v2 invalide: attendu { categories: [...] }");
  }
  return spec;
}

/**
 * Rendu de l'aide v2 (cheatsheet par défaut, filtres possibles).
 * - Deux colonnes: commande | description
 * - Lignes suivantes: Usage / Exemples / Notes / Aliases (dim)
 * - Contexte (en‑tête) si activé
 */
export function printHelp(
  spec: HelpSpecV2,
  runtime: HelpRuntimeContext = {},
  filter?: { kind: "all" | "examples" | "category" | "command" | "json" | "search"; value?: string }
): void {
  const width = Math.max(60, Math.max(0, (process.stdout.columns || 80) - 2));
  const margin = 0;
  const indent = "  ";

  const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
  const color = (fn: (s: string) => string) => (s: string) => (useColor ? fn(s) : s);
  const c = {
    title: color(chalk.cyan),
    cmd: color(chalk.white),
    dim: color(chalk.dim),
    danger: color(chalk.yellow),
  } as const;

  // En‑tête meta + légende
  const usage = spec.meta?.usage || `${spec.meta?.program || "xtouch-gw"} <commande> [options]`;
  writeLine(c.cmd(usage));
  const legendLines = spec.meta?.legend || [];
  if (legendLines.length > 0) writeLine(c.dim(legendLines.join(" — ")));

  // Contexte
  if (spec.context?.show) {
    const extra = spec.meta?.version ? [`Version: ${spec.meta.version}`, `Horodatage: ${runtime.nowIso || new Date().toISOString()}`] : [];
    const ctxLines = [...(spec.context.items || []).map((t) => interpolateContext(t, runtime)), ...extra];
    for (const l of ctxLines) writeLine(c.dim(l));
    if (ctxLines.length > 0) writeLine("");
  }

  const allCommands = flattenCommands(spec);

  // Filtrage
  let categories: HelpSpecV2Category[] = spec.categories;
  let commandDetails: HelpSpecV2Command | null = null;
  if (filter?.kind === "json") {
    writeLine(JSON.stringify(spec, null, 2));
    return;
  }
  if (filter?.kind === "category" && filter.value) {
    categories = spec.categories.filter((c) => c.id === filter.value || norm(c.title) === norm(filter.value!));
  } else if (filter?.kind === "search" && filter.value) {
    const q = norm(filter.value);
    categories = spec.categories.map((cat) => ({
      ...cat,
      commands: cat.commands.filter((cmd) => [cmd.name, cmd.usage, cmd.description].filter(Boolean).join("\n").toLowerCase().includes(q)),
    })).filter((c) => c.commands.length > 0);
  } else if (filter?.kind === "command" && filter.value) {
    commandDetails = resolveCommand(allCommands, filter.value);
    if (!commandDetails) {
      const sugg = suggestions(allCommands, filter.value);
      writeLine(c.danger(`Commande inconnue: ${filter.value}`));
      if (sugg.length > 0) writeLine(c.dim(`Voulez‑vous dire: ${sugg.join(", ")}`));
      return;
    }
  }

  if (filter?.kind === "command" && commandDetails) {
    printCommandBlock(commandDetails, width, indent, c);
    return;
  }

  // Cheatsheet: toutes les catégories ou filtrées
  for (const cat of categories) {
    writeLine(c.title(cat.title));
    const cmds = [...cat.commands].sort((a, b) => a.name.localeCompare(b.name));
    for (const cmd of cmds) {
      if (filter?.kind === "examples") {
        if (cmd.examples && cmd.examples.length > 0) {
          writeLine(indent + c.cmd(cmd.name));
          for (const ex of cmd.examples) writeLine(indent + indent + c.dim("Ex.: " + ex));
        }
        continue;
      }
      const label = (cmd.danger ? "⚠️  " : "") + c.cmd(cmd.name);
      const desc = cmd.description || "";
      renderTwoCols(label, desc, width, indent);
      if (cmd.usage) writeLine(indent + indent + c.dim("Usage: " + cmd.usage));
      if (cmd.examples && cmd.examples.length > 0) {
        const exLine = cmd.examples.slice(0, 3).join("   |   ");
        writeLine(indent + indent + c.dim("Ex.:   " + exLine));
      }
      if (cmd.aliases && cmd.aliases.length > 0) writeLine(indent + indent + c.dim("Alias: " + cmd.aliases.join(", ")));
      if (cmd.notes && cmd.notes.length > 0) {
        for (const n of cmd.notes) writeLine(indent + indent + (cmd.danger ? c.danger(n) : c.dim(n)));
      }
    }
    writeLine("");
  }

  writeLine(c.dim("Tapez 'help <cmd>' pour l'aide détaillée, 'help midi' pour filtrer. 'completion zsh' pour l'autocomplétion."));
}

/**
 * Rendu détaillé d'une commande (help <cmd>).
 */
function printCommandBlock(cmd: HelpSpecV2Command, width: number, indent: string, c: { cmd: (s:string)=>string; dim: (s:string)=>string; danger: (s:string)=>string; title: (s:string)=>string }): void {
  writeLine(c.cmd(cmd.name) + (cmd.description ? " — " + cmd.description : ""));
  if (cmd.usage) writeLine(indent + c.dim("Usage: " + cmd.usage));
  if (cmd.examples && cmd.examples.length > 0) {
    writeLine(indent + c.dim("Exemples:"));
    for (const ex of cmd.examples) writeLine(indent + indent + c.dim(ex));
  }
  if (cmd.aliases && cmd.aliases.length > 0) writeLine(indent + c.dim("Alias: " + cmd.aliases.join(", ")));
}

function renderTwoCols(left: string, right: string, width: number, indent: string): void {
  const leftPad = indent;
  const rightPad = indent + indent;
  const MAX_LEFT_COL = 22;
  const leftStr = leftPad + left;
  const leftWidth = Math.min(MAX_LEFT_COL, stringWidth(stripAnsi(leftStr)));
  const rightWidth = Math.max(10, width - leftWidth - 2);
  const wrappedRight = wrapText(right, rightWidth);
  const rightLines = wrappedRight.split("\n");
  // Première ligne: gauche + première ligne droite
  const firstRight = rightLines[0] || "";
  writeLine(padRight(leftStr, leftWidth) + "  " + firstRight);
  // Lignes suivantes: indentation sur la colonne droite uniquement
  for (let i = 1; i < rightLines.length; i++) writeLine(padRight("".padEnd(leftWidth), leftWidth) + "  " + rightLines[i]);
}

function interpolateContext(template: string, ctx: HelpRuntimeContext): string {
  return template
    .replace(/\$\{config\.path\}/g, ctx.configPath || "./config.yaml")
    .replace(/\$\{page\.active\}/g, ctx.pageActive || "—")
    .replace(/\$\{midi\.in\}/g, ctx.midiIn || "—")
    .replace(/\$\{midi\.out\}/g, ctx.midiOut || "—")
    .replace(/\$\{log\.level\}/g, ctx.logLevel || String(process.env.LOG_LEVEL || "info"))
    .replace(/\$\{modes\}/g, ctx.modes || "—");
}

function flattenCommands(spec: HelpSpecV2): HelpSpecV2Command[] {
  const arr: HelpSpecV2Command[] = [];
  for (const c of spec.categories) for (const cmd of c.commands) arr.push(cmd);
  return arr;
}

function resolveCommand(all: HelpSpecV2Command[], nameOrId: string): HelpSpecV2Command | null {
  const key = norm(nameOrId);
  for (const c of all) {
    const names = [c.id, c.name, ...(c.aliases || [])].map(norm);
    if (names.includes(key)) return c;
  }
  return null;
}

function suggestions(all: HelpSpecV2Command[], input: string): string[] {
  const candidates = new Map<string, number>();
  for (const c of all) {
    for (const k of [c.id, c.name, ...(c.aliases || [])]) {
      const d = levenshtein(norm(input), norm(k));
      candidates.set(k, Math.min(candidates.get(k) ?? Infinity, d));
    }
  }
  return [...candidates.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([k]) => k);
}

function norm(s: string): string { return s.trim().toLowerCase(); }

function padRight(s: string, width: number): string {
  const w = stringWidth(stripAnsi(s));
  if (w >= width) return s;
  return s + " ".repeat(width - w);
}

// Minimal ANSI stripper and width calculator to avoid extra deps
function stripAnsi(str: string): string { return str.replace(/[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ""); }
function stringWidth(str: string): number { return stripAnsi(str).length; }

function writeLine(s: string): void { process.stdout.write(s + "\n"); }

// levenshtein centralisé dans src/cli/levenshtein.ts

function wrapText(text: string, width: number): string {
  const words = (text || "").split(/\s+/);
  let line = "";
  const lines: string[] = [];
  for (const w of words) {
    if (w.length > width) {
      // Hard wrap tokens that exceed the width (e.g., long hex blocks)
      if (line.length > 0) { lines.push(line); line = ""; }
      for (let i = 0; i < w.length; i += width) lines.push(w.slice(i, i + width));
      continue;
    }
    if (line.length === 0) { line = w; continue; }
    if (stringWidth(stripAnsi(line + " " + w)) <= width) {
      line += " " + w;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join("\n");
}



