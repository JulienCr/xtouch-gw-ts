import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";

// Next.js App Router doesn't natively expose WS upgrade in route handlers.
// We implement a simple Server-Sent Events (SSE) endpoint for push updates.
// Force Node.js runtime because we rely on filesystem watchers.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      (async () => {
        // Send initial snapshot
        try {
          const repoRoot = path.resolve(process.cwd(), "..", "..");
          const snapshotPath = path.join(repoRoot, ".state", "snapshot.json");
          const send = async () => {
            try {
              const buf = await fs.readFile(snapshotPath, "utf8");
              controller.enqueue(encoder.encode(`data: ${buf}\n\n`));
            } catch {
              const fallback = JSON.stringify({ ts: Date.now(), apps: { voicemeeter: [], qlc: [], obs: [], "midi-bridge": [] } });
              controller.enqueue(encoder.encode(`data: ${fallback}\n\n`));
            }
          };
          await send();

          const { default: chokidar } = await import("chokidar");
          const watcher = chokidar.watch(snapshotPath, { ignoreInitial: true });
          watcher.on("change", async () => {
            await send();
          });
        } catch {
          // noop
        }
      })();
    },
    cancel() {},
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

