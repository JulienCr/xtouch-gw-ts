import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import YAML from "yaml";
import { resolveRootConfigPath } from "@/lib/configPath";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const p = resolveRootConfigPath();
    const raw = await fs.readFile(p, "utf8");
    // Validate YAML parses
    YAML.parse(raw);
    return NextResponse.json({ ok: true, yaml: raw }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const yaml = String(body?.yaml ?? "");
    if (!yaml || yaml.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "Empty YAML" }, { status: 400 });
    }
    // Parse to validate before writing
    const parsed = YAML.parse(yaml);
    // Optional: re-stringify to normalize formatting (keep user's formatting by default)
    const p = resolveRootConfigPath();
    await fs.writeFile(p, yaml, "utf8");
    return NextResponse.json({ ok: true, parsed }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}


