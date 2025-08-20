import type { CompleterResult } from "readline";
import { listInputPorts } from "../midi/sniffer";
import { loadHelpSpec } from "./help";
import { buildHelpRuntimeContext } from "./helpSupport";
import type { CliContext } from "./types";

function norm(s: string): string { return s.trim().toLowerCase(); }

export function makeCompleter(ctx: CliContext): (line: string) => CompleterResult {
  return (line: string): CompleterResult => {
    const words = line.split(/\s+/);
    const trailingSpace = /\s$/.test(line);
    const lastToken = trailingSpace ? "" : words[words.length - 1];
    const suggestLast = (candidates: string[]): CompleterResult => {
      const uniq = Array.from(new Set(candidates.filter(Boolean)));
      const hits = lastToken ? uniq.filter((x) => norm(x).startsWith(norm(lastToken))) : uniq;
      return [hits.length ? hits : uniq, lastToken];
    };

    try {
      const spec = loadHelpSpec();
      void buildHelpRuntimeContext(ctx); // keep side-effects minimal; not needed but future-proof
      const cmdStrings = new Set<string>();
      for (const cmd of spec.categories.flatMap((c) => c.commands)) {
        cmdStrings.add(cmd.name);
        for (const a of cmd.aliases || []) cmdStrings.add(a);
      }
      const allCmds = Array.from(cmdStrings);
      const prefix = line;
      const prefixNorm = norm(prefix);
      const sortedByLen = [...allCmds].sort((a, b) => b.length - a.length);
      const matched = sortedByLen.find((c) => {
        const cn = norm(c);
        return prefixNorm === cn || prefixNorm.startsWith(cn + " ") || (!trailingSpace && cn.startsWith(norm(words[0] || "")));
      });

      if (!matched || (!trailingSpace && prefixNorm.length < norm(matched).length)) {
        const byPrefix = allCmds.filter((c) => norm(c).startsWith(prefixNorm));
        if (byPrefix.length > 0) return [byPrefix, lastToken];
        return suggestLast(allCmds);
      }

      const matchedNorm = norm(matched);
      const argsCandidates = (() => {
        if (matchedNorm === "help") {
          const cats = spec.categories.map((c) => c.id);
          const cmds = spec.categories.flatMap((c) => c.commands.map((x) => x.name));
          return [...cats, ...cmds, "all", "examples", "json", "search "];
        }
        if (matchedNorm === "completion") return ["zsh", "bash", "powershell"];
        if (matchedNorm === "page") {
          const pages = ctx.router.listPages();
          const nums = pages.map((_, i) => String(i + 1));
          return [...pages, ...nums];
        }
        if (matchedNorm === "midi:open" || matchedNorm === "midi-open") {
          const ports = listInputPorts();
          const names = ports.map((p) => p.name);
          const idx = ports.map((p) => String(p.index));
          return [...idx, ...names];
        }
        if (matchedNorm === "state") return ["load", "rm"];
        if (matchedNorm === "fader") {
          if (words.length <= 2) return Array.from({ length: 16 }, (_, i) => String(i + 1));
          return ["0", "8192", "16383"];
        }
        if (matchedNorm === "lcd") return ["0", "1", "2", "3", "4", "5", "6", "7"];
        return [];
      })();
      return suggestLast(argsCandidates);
    } catch {
      const fallback = ["help", "exit", "quit", "version"];
      return suggestLast(fallback);
    }
  };
}


