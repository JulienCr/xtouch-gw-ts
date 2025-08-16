import { NextRequest } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";

export const dynamic = "force-dynamic"; // always fetch latest

export async function GET(_req: NextRequest) {
  try {
    const repoRoot = path.resolve(process.cwd(), "..", "..");
    const snapshotPath = path.join(repoRoot, ".state", "snapshot.json");
    let payload: any = { ts: Date.now(), apps: { voicemeeter: [], qlc: [], obs: [], "midi-bridge": [] } };
    try {
      const buf = await fs.readFile(snapshotPath, "utf8");
      payload = JSON.parse(buf);
    } catch {}
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500 });
  }
}

