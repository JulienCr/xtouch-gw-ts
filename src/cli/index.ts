import readline from "readline";
import { loadHelpSpec, printHelp } from "./help";
import { buildHelpRuntimeContext } from "./helpSupport";
import type { CliContext } from "./types";
import { makeCompleter } from "./completer";
import { handlers } from "./commands";
import { createInitialSession } from "./session";

export function attachCli(ctx: CliContext): () => void {

  const completer = makeCompleter(ctx);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, completer });
  try {
    const spec = loadHelpSpec();
    const runtime = buildHelpRuntimeContext(ctx);
    printHelp(spec, runtime);
  } catch (err) {
    process.stdout.write("Aide CLI indisponible (help.yaml introuvable ou invalide). Tapez 'help'.\n");
  }
  rl.setPrompt("app> ");
  rl.prompt();

  const session = createInitialSession();
  rl.on("line", async (line) => {
    const [rawCmd, ...rest] = line.trim().split(/\s+/);
    const cmd = rawCmd === "-h" || rawCmd === "--help" ? "help" : (rawCmd === "-v" || rawCmd === "--version" ? "version" : rawCmd);
    // MODIF: Early-dispatch to modular handlers; legacy switch kept below but bypassed via returns
    if (cmd === "exit" || cmd === "quit") {
          try { await ctx.onExit?.(); } catch {}
      if (!ctx.onExit) { try { rl.close(); } catch {} try { process.exit(0); } catch {} }
      return;
    }
    if (cmd === "clear") { try { process.stdout.write("\x1B[2J\x1B[3J\x1B[H"); } catch {} rl.prompt(); return; }
    const handler = (handlers as any)[cmd] as ((args: string[], ctx: CliContext, session: any) => Promise<void> | void) | undefined;
    if (handler) { await handler(rest, ctx, session); rl.prompt(); return; }
    await handlers.default!([cmd], ctx, session); rl.prompt(); return;
    // MODIF: all commands handled above via modular handlers
    rl.prompt();
  });

  const onSig = () => {
    rl.close();
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  rl.on("close", () => {
    try { session.midiSniffer?.close(); } catch {}
    try { const p = ctx.onExit?.(); if (p && typeof (p as any).then === "function") { (p as Promise<void>).catch(() => {}); } } catch {}
  });

  return () => {
    rl.close();
  };
}
