import YAML from "yaml";
import { promises as fs } from "fs";
import Link from "next/link";
import { resolveRootConfigPath } from "@/lib/configPath";
import type { AppConfig, PageConfig, PassthroughConfig, MidiEventTypeName } from "@/types/config";
import PageEditorSsr from "./pageEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadConfig(): Promise<AppConfig> {
  const p = resolveRootConfigPath();
  const raw = await fs.readFile(p, "utf8");
  return YAML.parse(raw) as AppConfig;
}

export default async function Page({ params }: { params: Promise<{ index: string }> }) {
  const { index } = await params;
  const idx = Number(index);
  const cfg = await loadConfig();
  const page = cfg.pages[idx];
  if (!page) return <div className="p-6">Page introuvable</div>;
  return (
    <main className="min-h-screen p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Éditer: {page.name || `Page ${idx + 1}`}</h1>
        <Link href="/" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">← Retour</Link>
      </div>
      <PageEditorSsr index={idx} page={page} />
    </main>
  );
}


