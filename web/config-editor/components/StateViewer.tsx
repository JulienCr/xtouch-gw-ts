"use client";
import { useMemo } from "react";
import { useStateFeed, type MidiStateEntry } from "@/hooks/useStateFeed";

function Fader({ value, max }: { value: number; max: number }) {
  return (
    <input type="range" min={0} max={max} value={value} readOnly className="w-full" />
  );
}

function NoteLamp({ on }: { on: boolean }) {
  return (
    <div className={`text-center py-2 rounded ${on ? "bg-green-800 text-green-300" : "bg-gray-800 text-gray-400"}`}>
      {on ? "ON" : "OFF"}
    </div>
  );
}

function ItemCard({ e }: { e: MidiStateEntry }) {
  const kind = e?.addr?.status;
  const ch = e?.addr?.channel || 0;
  const d1 = e?.addr?.data1 || 0;
  const header = `${kind} ch=${ch} d1=${d1}`;
  const value = typeof e.value === "number" ? e.value : 0;

  return (
    <div className="border border-gray-700 rounded p-2">
      <div className="mb-1 text-sm text-gray-300">{header}</div>
      {kind === "note" ? (
        <NoteLamp on={value > 0} />
      ) : kind === "cc" ? (
        <Fader value={value} max={127} />
      ) : kind === "pb" ? (
        <Fader value={value} max={16383} />
      ) : null}
    </div>
  );
}

function Section({ title, entries }: { title: string; entries: MidiStateEntry[] }) {
  const items = useMemo(() => entries ?? [], [entries]);
  return (
    <section className="mb-6">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        {items.map((e, idx) => (
          <ItemCard key={`${title}-${idx}`} e={e} />
        ))}
      </div>
    </section>
  );
}

export default function StateViewer() {
  const { snapshot, error } = useStateFeed();

  if (error) return <div className="text-red-400">Erreur: {error}</div>;
  if (!snapshot) return <div className="text-gray-400">Chargement du state…</div>;

  return (
    <div>
      <div className="text-sm text-gray-400 mb-4">Dernière mise à jour: {new Date(snapshot.ts).toLocaleTimeString()}</div>
      {Object.entries(snapshot.apps).map(([appKey, entries]) => (
        <Section key={appKey} title={appKey} entries={entries as MidiStateEntry[]} />
      ))}
    </div>
  );
}

