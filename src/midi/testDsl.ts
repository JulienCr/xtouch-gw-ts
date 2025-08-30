import { rawFromPb14, parseNumberMaybeHex } from "../midi/utils";
import { rawFromNoteOn, rawFromNoteOff, rawFromControlChange } from "../midi/bytes";

export type ParsedWait = { kind: "Wait"; ms: number };
export type ParsedRaw = { kind: "Raw"; bytes: [number, number, number]; label: string };
export type Parsed = ParsedWait | ParsedRaw;

const toInt = (v: string | undefined, fb: number): number => {
  if (v == null) return fb;
  // Support: 0x.., ..h, décimal, et suffixe optionnel 'n' (ex: 0x1n → 0x1)
  let value = v.trim();
  if (value.toLowerCase().endsWith('n')) value = value.slice(0, -1);
  const n = parseNumberMaybeHex(value, fb);
  return Number.isFinite(n) && n >= 0 ? n : fb;
};

export function parseCommand(line: string, opts: { defaultDelayMs: number; noteOffAsNoteOn0: boolean }): Parsed | null {
  const s = line.trim();
  if (!s) return null;
  const [head, ...rest] = s.split(/\s+/);
  const cmd = head.toLowerCase();
  const params: Record<string, string> = {};
  for (const part of rest) {
    const [k, v] = part.split("=");
    if (k && v !== undefined) params[k.toLowerCase()] = v;
  }
  if (cmd === "wait") {
    const ms = toInt(params.ms ?? params.delay, opts.defaultDelayMs);
    return { kind: "Wait", ms };
  }
  const ch = Math.max(1, Math.min(16, toInt(params.ch ?? params.channel, 1)));
  if (cmd === "cc" || cmd === "controlchange") {
    const cc = toInt(params.cc ?? params.control ?? params.num, 0) & 0x7f;
    const val = toInt(params.value ?? params.val, 0) & 0x7f;
    const bytes = rawFromControlChange(ch, cc, val);
    return { kind: "Raw", bytes, label: `CC ch=${ch} cc=${cc} val=${val}` };
  }
  if (cmd === "pb" || cmd === "pitchbend") {
    const val14 = Math.max(0, Math.min(16383, toInt(params.value ?? params.val ?? params.value14, 8192)));
    const [status, lsb, msb] = rawFromPb14(ch, val14);
    const bytes: [number, number, number] = [status, lsb, msb];
    return { kind: "Raw", bytes, label: `PitchBend ch=${ch} val14=${val14}` };
  }
  const note = toInt(params.note, 0) & 0x7f;
  const isOff = cmd === "noteoff";
  const asOn0 = isOff && opts.noteOffAsNoteOn0;
  if (cmd !== "noteon" && !isOff) return null;
  const velDefault = cmd === "noteon" ? 127 : 0;
  const vel = toInt(params.velocity ?? params.vel, velDefault) & 0x7f;
  const bytes: [number, number, number] = asOn0
    ? rawFromNoteOn(ch, note, 0)
    : (cmd === "noteon" ? rawFromNoteOn(ch, note, vel) : rawFromNoteOff(ch, note, vel));
  const kind = asOn0 ? "NoteOff→NoteOn0" : (cmd === "noteon" ? "NoteOn" : "NoteOff");
  return { kind: "Raw", bytes, label: `${kind} ch=${ch} note=${note} vel=${vel}` };
}

export function parseSequence(lines: string[], opts: { defaultDelayMs: number; noteOffAsNoteOn0: boolean }): Parsed[] {
  return lines.map((l) => parseCommand(l, opts)).filter((x): x is Parsed => !!x);
}
