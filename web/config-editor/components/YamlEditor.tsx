"use client";
import { useEffect, useMemo, useState } from "react";
import YAML from "yaml";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

export default function YamlEditor() {
  const [yamlText, setYamlText] = useState<string>("");
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: YAML.parse(yamlText) };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }, [yamlText]);

  async function loadYaml() {
    try {
      setStatus({ type: "loading", message: "Chargement..." });
      const res = await fetch("/api/config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Erreur de chargement");
      setYamlText(String(data.yaml ?? ""));
      setStatus({ type: "success", message: "Config chargée" });
    } catch (e) {
      setStatus({ type: "error", message: String(e) });
    }
  }

  async function saveYaml() {
    try {
      setStatus({ type: "loading", message: "Sauvegarde..." });
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: yamlText }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Erreur de sauvegarde");
      const ts = new Date().toLocaleTimeString();
      setLastSavedAt(ts);
      setStatus({ type: "success", message: "Sauvegardé" });
    } catch (e) {
      setStatus({ type: "error", message: String(e) });
    }
  }

  useEffect(() => {
    loadYaml();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isValid = parsed.ok;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Éditeur de configuration</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadYaml}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Recharger
          </button>
          <button
            onClick={saveYaml}
            disabled={!isValid || status.type === "loading"}
            className="rounded-md bg-black text-white px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sauvegarder
          </button>
        </div>
      </div>

      {status.type !== "idle" && (
        <div
          className={
            "text-sm" +
            (status.type === "error"
              ? " text-red-700"
              : status.type === "success"
              ? " text-green-700"
              : " text-gray-600")
          }
        >
          {status.message}
          {lastSavedAt && status.type === "success" ? ` à ${lastSavedAt}` : ""}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">config.yaml</label>
          <textarea
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            spellCheck={false}
            className="h-[70vh] w-full resize-none rounded-md border p-3 font-mono text-sm leading-5"
          />
          <div className="text-xs text-gray-500">
            {isValid ? "YAML valide" : `YAML invalide: ${(parsed as any).error}`}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Aperçu (JSON)</label>
          <pre className="h-[70vh] overflow-auto rounded-md border p-3 text-sm bg-gray-50">
            {isValid ? JSON.stringify((parsed as any).value, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}


