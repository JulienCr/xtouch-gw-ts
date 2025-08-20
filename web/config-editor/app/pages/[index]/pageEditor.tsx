"use client";
import { useEffect, useMemo, useState } from "react";
import YAML from "yaml";
import type { AppConfig, PageConfig, PassthroughConfig, MidiEventTypeName, MidiFilterConfig, TransformConfig, ControlMapping } from "@/types/config";
import { useMidiPorts } from "@/hooks/useMidiPorts";
import LcdEditor from "@/components/LcdEditor";

export default function PageEditorSsr({ index, page }: { index: number; page: PageConfig }) {
  const [state, setState] = useState<PageConfig>(page);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    try {
      setSaving(true);
      // Fetch full config, replace the page, write back
      const resGet = await fetch("/api/config", { cache: "no-store" });
      const dataGet = await resGet.json();
      if (!resGet.ok || !dataGet?.ok) throw new Error(dataGet.error || "load error");
      const cfg = YAML.parse(String(dataGet.yaml)) as AppConfig;
      const pages = [...cfg.pages];
      pages[index] = state;
      const yaml = YAML.stringify({ ...cfg, pages });
      const resPut = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml }),
      });
      const dataPut = await resPut.json();
      if (!resPut.ok || !dataPut?.ok) throw new Error(dataPut.error || "save error");
      setMsg("Sauvegardé");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} className="rounded border px-2 py-1" />
        <button onClick={save} disabled={saving} className="rounded bg-black text-white px-3 py-2 text-sm disabled:opacity-50">Sauvegarder</button>
        {msg && <div className="text-sm text-gray-600">{msg}</div>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">LCD (éditable)</label>
        <LcdEditor
          labels={state.lcd?.labels || []}
          onChange={(labels) => setState({ ...state, lcd: { ...(state.lcd || {}), labels } })}
        />
      </div>

      <ColorEditor
        colors={(state.lcd?.colors as any) || []}
        onChange={(colors) => setState({ ...state, lcd: { ...(state.lcd || {}), colors } })}
      />

      <PassthroughsEditor
        passthroughs={state.passthroughs || (state.passthrough ? [state.passthrough] : [])}
        onChange={(list) => setState({ ...state, passthrough: undefined, passthroughs: list })}
      />

      <ControlsEditor
        controls={(state.controls || {}) as Record<string, ControlMapping>}
        onChange={(controls) => setState({ ...state, controls })}
      />
    </div>
  );
}

function PassthroughsEditor({ passthroughs, onChange }: { passthroughs: PassthroughConfig[]; onChange: (v: PassthroughConfig[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Passthroughs</h3>
        <button className="rounded border px-2 py-1 text-sm" onClick={() => onChange([...(passthroughs || []), { driver: "midi", to_port: "", from_port: "" } as PassthroughConfig])}>
          + Ajouter
        </button>
      </div>
      <div className="space-y-3">
        {(passthroughs || []).map((p, idx) => (
          <div key={idx} className="rounded border p-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <LabeledSelect label="Driver" value={p.driver} onChange={(v) => onChange(updateAt(passthroughs, idx, { ...p, driver: v }))} options={["midi", "voicemeeter", "qlc", "obs"]} />
              {p.driver === "midi" ? (
                <MidiPortSelect label="To Port" value={p.to_port} onChange={(v) => onChange(updateAt(passthroughs, idx, { ...p, to_port: v }))} kind="output" />
              ) : (
                <LabeledInput label="To Port" value={p.to_port} onChange={(v) => onChange(updateAt(passthroughs, idx, { ...p, to_port: v }))} />
              )}
              {p.driver === "midi" ? (
                <MidiPortSelect label="From Port" value={p.from_port} onChange={(v) => onChange(updateAt(passthroughs, idx, { ...p, from_port: v }))} kind="input" />
              ) : (
                <LabeledInput label="From Port" value={p.from_port} onChange={(v) => onChange(updateAt(passthroughs, idx, { ...p, from_port: v }))} />
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={!!p.optional} onChange={(e) => onChange(updateAt(passthroughs, idx, { ...p, optional: e.target.checked }))} />
                <span>Optional</span>
              </label>
            </div>

            <FiltersEditor value={p.filter} onChange={(filter) => onChange(updateAt(passthroughs, idx, { ...p, filter }))} />
            <TransformsEditor value={p.transform} onChange={(transform) => onChange(updateAt(passthroughs, idx, { ...p, transform }))} />

            <div className="flex justify-end">
              <button className="rounded border px-2 py-1 text-xs" onClick={() => onChange(passthroughs.filter((_, i) => i !== idx))}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlsEditor({ controls, onChange }: { controls: Record<string, ControlMapping>; onChange: (v: Record<string, ControlMapping>) => void }) {
  const ids = Object.keys(controls);
  const [newId, setNewId] = useState<string>("");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Controls</h3>
        <div className="flex items-center gap-2">
          <input className="rounded border px-2 py-1 text-sm" placeholder="controlId (ex: fader1)" value={newId} onChange={(e) => setNewId(e.target.value)} />
          <button
            className="rounded border px-2 py-1 text-sm"
            onClick={() => {
              const id = newId.trim();
              if (!id) return;
              onChange({ ...controls, [id]: { app: "qlc", midi: { type: "cc", channel: 1, cc: 81 } } as any });
              setNewId("");
            }}
          >
            + Ajouter
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {ids.length === 0 && <div className="text-sm text-gray-500">Aucun control</div>}
        {ids.map((id) => (
          <div key={id} className="rounded border p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-mono text-sm">{id}</div>
              <button className="rounded border px-2 py-1 text-xs" onClick={() => { const copy = { ...controls }; delete copy[id]; onChange(copy); }}>Supprimer</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <LabeledSelect label="App" value={controls[id]?.app || "qlc"} onChange={(v) => onChange({ ...controls, [id]: { ...(controls[id] || {}), app: v } as any })} options={["voicemeeter", "qlc", "obs", "console"]} />
              <LabeledSelect label="Type" value={controls[id]?.midi?.type || "cc"} onChange={(v) => onChange({ ...controls, [id]: { ...(controls[id] || {}), midi: { ...(controls[id]?.midi || {}), type: v as any } } })} options={["cc", "note", "pb"]} />
              <LabeledInput label="Channel" value={String(controls[id]?.midi?.channel ?? 1)} onChange={(v) => onChange({ ...controls, [id]: { ...(controls[id] || {}), midi: { ...(controls[id]?.midi || {}), channel: Number(v) } } })} />
              {controls[id]?.midi?.type === "cc" && (
                <LabeledInput label="CC" value={String(controls[id]?.midi?.cc ?? 0)} onChange={(v) => onChange({ ...controls, [id]: { ...(controls[id] || {}), midi: { ...(controls[id]?.midi || {}), cc: Number(v) } } })} />
              )}
              {controls[id]?.midi?.type === "note" && (
                <LabeledInput label="Note" value={String(controls[id]?.midi?.note ?? 0)} onChange={(v) => onChange({ ...controls, [id]: { ...(controls[id] || {}), midi: { ...(controls[id]?.midi || {}), note: Number(v) } } })} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="min-w-36 text-gray-600">{label}</span>
      <input className="flex-1 rounded border px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="min-w-36 text-gray-600">{label}</span>
      <select className="flex-1 rounded border px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function MidiPortSelect({ label, value, onChange, kind }: { label: string; value: string; onChange: (v: string) => void; kind: "input" | "output" }) {
  const { inputs, outputs, loading, error } = useMidiPorts();
  const list = kind === "input" ? inputs : outputs;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="min-w-36 text-gray-600">{label}</span>
      <select className="flex-1 rounded border px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {list.length === 0 && <option value="">{loading ? "Chargement..." : error ? "Erreur" : "Aucun port"}</option>}
        {list.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function FiltersEditor({ value, onChange }: { value: MidiFilterConfig | undefined; onChange: (v: MidiFilterConfig | undefined) => void }) {
  const filter = value || {};
  const [channels, setChannels] = useState<string>(Array.isArray(filter.channels) ? filter.channels.join(",") : "");
  const ALL_TYPES: MidiEventTypeName[] = [
    "noteOn",
    "noteOff",
    "controlChange",
    "programChange",
    "channelAftertouch",
    "polyAftertouch",
    "pitchBend",
  ];
  const [typesSet, setTypesSet] = useState<Set<MidiEventTypeName>>(new Set((filter.types || []) as MidiEventTypeName[]));
  const [includeNotes, setIncludeNotes] = useState<string>(Array.isArray(filter.includeNotes) ? filter.includeNotes.join(",") : "");
  const [excludeNotes, setExcludeNotes] = useState<string>(Array.isArray(filter.excludeNotes) ? filter.excludeNotes.join(",") : "");

  useEffect(() => {
    onChange({
      channels: parseCsvNumber(channels),
      types: typesSet.size ? Array.from(typesSet) : undefined,
      includeNotes: parseCsvNumber(includeNotes),
      excludeNotes: parseCsvNumber(excludeNotes),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, typesSet, includeNotes, excludeNotes]);

  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">Filtres</div>
      <LabeledInput label="Channels (csv)" value={channels} onChange={setChannels} />
      <div className="text-sm">
        <div className="mb-1 text-gray-600">Types</div>
        <div className="flex flex-wrap gap-2">
          {ALL_TYPES.map((t) => (
            <label key={t} className={`inline-flex items-center gap-2 px-2 py-1 rounded border cursor-pointer ${typesSet.has(t) ? "bg-black text-white" : "bg-white"}`}>
              <input
                type="checkbox"
                className="hidden"
                checked={typesSet.has(t)}
                onChange={(e) => {
                  const ns = new Set(typesSet);
                  if (e.target.checked) ns.add(t);
                  else ns.delete(t);
                  setTypesSet(ns);
                }}
              />
              <span className="text-xs capitalize">{t}</span>
            </label>
          ))}
        </div>
      </div>
      <LabeledInput label="Include Notes (csv)" value={includeNotes} onChange={setIncludeNotes} />
      <LabeledInput label="Exclude Notes (csv)" value={excludeNotes} onChange={setExcludeNotes} />
    </div>
  );
}

function TransformsEditor({ value, onChange }: { value: TransformConfig | undefined; onChange: (v: TransformConfig | undefined) => void }) {
  const t = value || {};
  const [pbNoteEnabled, setPbNoteEnabled] = useState<boolean>(!!t.pb_to_note);
  const [pbNote, setPbNote] = useState<string>(t.pb_to_note?.note != null ? String(t.pb_to_note.note) : "");
  const [pbCcEnabled, setPbCcEnabled] = useState<boolean>(!!t.pb_to_cc);
  const [pbCcTargetChannel, setPbCcTargetChannel] = useState<string>(t.pb_to_cc?.target_channel != null ? String(t.pb_to_cc.target_channel) : "");
  const [pbCcBase, setPbCcBase] = useState<string>(t.pb_to_cc?.base_cc != null ? String(t.pb_to_cc.base_cc) : "");

  useEffect(() => {
    onChange({
      pb_to_note: pbNoteEnabled ? { note: toNumberOrUndefined(pbNote) } : undefined,
      pb_to_cc: pbCcEnabled
        ? {
            target_channel: toNumberOrUndefined(pbCcTargetChannel),
            base_cc: pbCcBase || undefined,
          }
        : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pbNoteEnabled, pbNote, pbCcEnabled, pbCcTargetChannel, pbCcBase]);

  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">Transforms</div>
      <div className="flex items-center gap-4 flex-wrap">
        <Toggle checked={pbNoteEnabled} onChange={setPbNoteEnabled} label="PitchBend → Note" />
        {pbNoteEnabled && (
          <input className="rounded border px-2 py-1" placeholder="note (0..127)" value={pbNote} onChange={(e) => setPbNote(e.target.value)} />
        )}
        <Toggle checked={pbCcEnabled} onChange={setPbCcEnabled} label="PitchBend → CC" />
        {pbCcEnabled && (
          <>
            <input className="rounded border px-2 py-1" placeholder="target_channel" value={pbCcTargetChannel} onChange={(e) => setPbCcTargetChannel(e.target.value)} />
            <input className="rounded border px-2 py-1" placeholder="base_cc (ex: 0x45)" value={pbCcBase} onChange={(e) => setPbCcBase(e.target.value)} />
          </>
        )}
      </div>
    </div>
  );
}

function updateAt<T>(arr: T[], index: number, value: T): T[] {
  const copy = [...arr];
  copy[index] = value;
  return copy;
}

function parseCsvNumber(csv: string): number[] | undefined {
  const parts = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return parts.length ? parts : undefined;
}

function parseCsvString(csv: string): string[] | undefined {
  const parts = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function toNumberOrUndefined(v: string): number | undefined {
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-black" : "bg-gray-300"}`}
        aria-pressed={checked}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-1"}`} />
      </button>
      <span>{label}</span>
    </label>
  );
}

function ColorEditor({ colors, onChange }: { colors: Array<number | string>; onChange: (v: Array<number | string>) => void }) {
  const palette: { value: number; name: string; swatch: string }[] = [
    { value: 0, name: "Off", swatch: "#000000" },
    { value: 1, name: "Red", swatch: "#ff4d4d" },
    { value: 2, name: "Green", swatch: "#5eff5e" },
    { value: 3, name: "Yellow", swatch: "#ffff66" },
    { value: 4, name: "Blue", swatch: "#6ea8ff" },
    { value: 5, name: "Magenta", swatch: "#ff6eff" },
    { value: 6, name: "Cyan", swatch: "#6effff" },
    { value: 7, name: "White", swatch: "#ffffff" },
  ];
  const list: Array<number | string> = [...colors];
  while (list.length < 8) list.push(0);
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">LCD Couleurs</div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        {list.slice(0, 8).map((v, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <span className="min-w-12">Strip {i + 1}</span>
            <select
              className="flex-1 rounded border px-2 py-1"
              value={Number(v)}
              onChange={(e) => {
                const copy = [...list];
                copy[i] = Number(e.target.value);
                onChange(copy);
              }}
            >
              {palette.map((c) => (
                <option value={c.value} key={c.value}>
                  {c.value} - {c.name}
                </option>
              ))}
            </select>
            <span className="inline-block h-4 w-4 rounded border" style={{ background: palette.find((p) => p.value === Number(v))?.swatch }} />
          </label>
        ))}
      </div>
    </div>
  );
}


