import { decodeMidi, formatDecoded } from "./decoder";

export function hex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

export function human(bytes: number[]): string {
  try {
    const evt = decodeMidi(bytes);
    if (evt.type === "controlChange") {
      const ccHex = `0x${evt.controller.toString(16)}`;
      const valHex = `0x${evt.value.toString(16)}`;
      return `CC ch=${evt.channel} cc=${evt.controller} (${ccHex}) val=${evt.value} (${valHex})`;
    }
    if (evt.type === "noteOn" || evt.type === "noteOff") {
      const nHex = `0x${evt.note.toString(16)}`;
      const vHex = `0x${evt.velocity.toString(16)}`;
      const t = evt.type === "noteOn" ? "NoteOn" : "NoteOff";
      return `${t} ch=${evt.channel} note=${evt.note} (${nHex}) vel=${evt.velocity} (${vHex})`;
    }
    if (evt.type === "pitchBend") {
      return `PitchBend ch=${evt.channel} val14=${evt.value14} norm=${evt.normalized.toFixed(3)}`;
    }
    return formatDecoded(evt);
  } catch {
    return "Unknown";
  }
}

export function parseNumberMaybeHex(value: number | string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    // Support formats: "0x45", "45h", "45"
    if (/^0x[0-9a-f]+$/i.test(trimmed)) return parseInt(trimmed, 16);
    if (/^[0-9a-f]+h$/i.test(trimmed)) return parseInt(trimmed.slice(0, -1), 16);
    const asDec = Number(trimmed);
    if (Number.isFinite(asDec)) return asDec as number;
  }
  return fallback;
}


