"use client";
import { useEffect, useMemo, useState } from "react";
import YAML from "yaml";
import type { AppConfig, PageConfig, PassthroughConfig } from "@/types/config";
import { useMidiPorts } from "@/hooks/useMidiPorts";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4 space-y-3 bg-white">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="min-w-36 text-gray-600">{label}</span>
      <input {...props} className="flex-1 rounded border px-2 py-1" />
    </label>
  );
}

function MidiPortsSelector({ input, output, onChange }: { input: string; output: string; onChange: (v: { input_port: string; output_port: string }) => void }) {
  const { inputs, outputs, loading, error } = useMidiPorts();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="min-w-36 text-gray-600">Input Port</span>
        <select
          className="flex-1 rounded border px-2 py-1"
          value={input}
          onChange={(e) => onChange({ input_port: e.target.value, output_port: output })}
        >
          {inputs.length === 0 && <option value="">{loading ? "Chargement..." : error ? "Erreur" : "Aucun port"}</option>}
          {inputs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="min-w-36 text-gray-600">Output Port</span>
        <select
          className="flex-1 rounded border px-2 py-1"
          value={output}
          onChange={(e) => onChange({ input_port: input, output_port: e.target.value })}
        >
          {outputs.length === 0 && <option value="">{loading ? "Chargement..." : error ? "Erreur" : "Aucun port"}</option>}
          {outputs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export default function ConfigBuilder() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [showYaml, setShowYaml] = useState<boolean>(false);

  async function load() {
    try {
      setStatus({ type: "loading", message: "Chargement..." });
      const res = await fetch("/api/config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Erreur de chargement");
      const parsed = YAML.parse(String(data.yaml));
      setConfig(parsed);
      setStatus({ type: "success", message: "Config chargée" });
    } catch (e) {
      setStatus({ type: "error", message: String(e) });
    }
  }

  async function save() {
    if (!config) return;
    try {
      setStatus({ type: "loading", message: "Sauvegarde..." });
      const yaml = YAML.stringify(config);
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Erreur de sauvegarde");
      setStatus({ type: "success", message: "Sauvegardé" });
    } catch (e) {
      setStatus({ type: "error", message: String(e) });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const yamlPreview = useMemo(() => (config ? YAML.stringify(config) : ""), [config]);

  if (!config) {
    return <div className="p-6">Chargement…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Config Builder</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
            Recharger
          </button>
          <button onClick={() => setShowYaml((v) => !v)} className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
            {showYaml ? "Masquer YAML" : "Voir YAML"}
          </button>
          <button onClick={save} className="rounded bg-black text-white px-3 py-2 text-sm">
            Sauvegarder
          </button>
        </div>
      </div>

      {status.type !== "idle" && (
        <div className={`text-sm ${status.type === "error" ? "text-red-700" : status.type === "success" ? "text-green-700" : "text-gray-600"}`}>
          {status.message}
        </div>
      )}

      <Section title="MIDI">
        <MidiPortsSelector
          input={config.midi.input_port}
          output={config.midi.output_port}
          onChange={(midi) => setConfig({ ...config, midi })}
        />
      </Section>

      <Section title="Fonctionnalités">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!config.features?.vm_sync}
            onChange={(e) => setConfig({ ...config, features: { ...(config.features || {}), vm_sync: e.target.checked } })}
          />
          <span>Voicemeeter Sync</span>
        </label>
      </Section>

      <Section title="Paging">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="Channel"
            type="number"
            value={config.paging?.channel ?? 1}
            onChange={(e) => setConfig({ ...config, paging: { ...(config.paging || {}), channel: Number(e.target.value) } })}
          />
          <Input
            label="Prev Note"
            type="number"
            value={config.paging?.prev_note ?? 46}
            onChange={(e) => setConfig({ ...config, paging: { ...(config.paging || {}), prev_note: Number(e.target.value) } })}
          />
          <Input
            label="Next Note"
            type="number"
            value={config.paging?.next_note ?? 47}
            onChange={(e) => setConfig({ ...config, paging: { ...(config.paging || {}), next_note: Number(e.target.value) } })}
          />
        </div>
      </Section>

      <Section title="Pages">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {config.pages.map((page, idx) => (
              <a key={idx} href={`/pages/${idx}`} className="rounded border p-3 hover:bg-gray-50">
                <div className="font-medium">{page.name || `Page ${idx + 1}`}</div>
                <div className="text-xs text-gray-500">{page.lcd?.labels?.[0] ? "LCD configuré" : "LCD vide"}</div>
              </a>
            ))}
          </div>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => setConfig({ ...config, pages: [...config.pages, { name: "New Page", controls: {}, lcd: { labels: [] }, passthroughs: [] }] })}
          >
            + Ajouter une page
          </button>
        </div>
      </Section>

      {showYaml && (
        <Section title="Aperçu YAML">
          <pre className="text-sm overflow-auto max-h-[60vh] bg-gray-50 p-3 rounded border">{yamlPreview}</pre>
        </Section>
      )}
    </div>
  );
}

function PageEditor({ page, onChange, onRemove }: { page: PageConfig; onChange: (p: PageConfig) => void; onRemove: () => void }) {
  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={page.name}
          onChange={(e) => onChange({ ...page, name: e.target.value })}
          className="flex-1 rounded border px-2 py-1"
        />
        <button className="rounded border px-3 py-1 text-sm" onClick={onRemove}>
          Supprimer
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">LCD Labels (8)</label>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => {
            const current = page.lcd?.labels?.[i] ?? "";
            const val = typeof current === "string" ? current : `${current?.upper || ""}${current?.lower ? `\n${current.lower}` : ""}`;
            return (
              <input
                key={i}
                placeholder={`Label ${i + 1}`}
                value={val}
                onChange={(e) => {
                  const labels = [...(page.lcd?.labels || [])];
                  labels[i] = e.target.value;
                  onChange({ ...page, lcd: { ...(page.lcd || {}), labels } });
                }}
                className="rounded border px-2 py-1 text-sm"
              />
            );
          })}
        </div>
      </div>

      <PassthroughsEditor
        passthroughs={page.passthroughs || (page.passthrough ? [page.passthrough] : [])}
        onChange={(list) => onChange({ ...page, passthrough: undefined, passthroughs: list })}
      />
    </div>
  );
}

function PassthroughsEditor({
  passthroughs,
  onChange,
}: {
  passthroughs: PassthroughConfig[];
  onChange: (list: PassthroughConfig[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Passthroughs</h3>
        <button
          className="rounded border px-2 py-1 text-sm"
          onClick={() => onChange([...(passthroughs || []), { driver: "midi", to_port: "", from_port: "" } as PassthroughConfig])}
        >
          + Ajouter
        </button>
      </div>
      <div className="space-y-3">
        {(passthroughs || []).map((p, idx) => (
          <div key={idx} className="rounded border p-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input label="Driver" value={p.driver} onChange={(e) => onChange(updateAt(passthroughs, idx, { ...p, driver: e.target.value }))} />
              <Input label="To Port" value={p.to_port} onChange={(e) => onChange(updateAt(passthroughs, idx, { ...p, to_port: e.target.value }))} />
              <Input label="From Port" value={p.from_port} onChange={(e) => onChange(updateAt(passthroughs, idx, { ...p, from_port: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!p.optional}
                  onChange={(e) => onChange(updateAt(passthroughs, idx, { ...p, optional: e.target.checked }))}
                />
                <span>Optional</span>
              </label>
            </div>
            <div className="text-xs text-gray-500">Filtres/Transforms seront ajoutés après le MVP.</div>
            <div className="flex justify-end">
              <button className="rounded border px-2 py-1 text-xs" onClick={() => onChange(passthroughs.filter((_, i) => i !== idx))}>
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function updateAt<T>(arr: T[], index: number, value: T): T[] {
  const copy = [...arr];
  copy[index] = value;
  return copy;
}


