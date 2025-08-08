export type MidiEventType =
  | "noteOn"
  | "noteOff"
  | "controlChange"
  | "programChange"
  | "channelAftertouch"
  | "polyAftertouch"
  | "pitchBend"
  | "systemExclusive"
  | "systemRealtime"
  | "systemCommon"
  | "unknown";

interface BaseEvent {
  channel?: number; // 1..16 quand applicable
  raw: number[];
}

export interface NoteEvent extends BaseEvent {
  type: "noteOn" | "noteOff";
  note: number; // 0..127
  velocity: number; // 0..127
}

export interface ControlChangeEvent extends BaseEvent {
  type: "controlChange";
  controller: number; // CC number 0..127
  value: number; // 0..127
  relativeDelta?: number; // interprétation relative (si détectable)
}

export interface PitchBendEvent extends BaseEvent {
  type: "pitchBend";
  value14: number; // 0..16383
  normalized: number; // 0..1
}

export interface ProgramChangeEvent extends BaseEvent {
  type: "programChange";
  program: number; // 0..127
}

export interface ChannelAftertouchEvent extends BaseEvent {
  type: "channelAftertouch";
  pressure: number; // 0..127
}

export interface PolyAftertouchEvent extends BaseEvent {
  type: "polyAftertouch";
  note: number;
  pressure: number; // 0..127
}

export interface SystemExclusiveEvent extends BaseEvent {
  type: "systemExclusive";
}

export interface SystemEvent extends BaseEvent {
  type: "systemRealtime" | "systemCommon";
  status: number;
}

export interface UnknownEvent extends BaseEvent {
  type: "unknown";
}

export type DecodedMidiEvent =
  | NoteEvent
  | ControlChangeEvent
  | PitchBendEvent
  | ProgramChangeEvent
  | ChannelAftertouchEvent
  | PolyAftertouchEvent
  | SystemExclusiveEvent
  | SystemEvent
  | UnknownEvent;

function computeRelativeDelta(value: number): number | undefined {
  // Heuristique classique relative: 1..63 increments, 65..127 decrements
  if (value === 0x00 || value === 0x40) return 0;
  if (value >= 1 && value <= 63) return value; // +N
  if (value >= 65 && value <= 127) return value - 128; // négatif
  return undefined;
}

export function decodeMidi(raw: number[]): DecodedMidiEvent {
  if (raw.length === 0) return { type: "unknown", raw };
  const status = raw[0];
  if (status === 0xf0) {
    return { type: "systemExclusive", raw };
  }
  if (status >= 0xf8) {
    return { type: "systemRealtime", raw, status } as SystemEvent;
  }
  if (status >= 0xf0) {
    return { type: "systemCommon", raw, status } as SystemEvent;
  }

  const high = (status & 0xf0) >> 4; // type nibble
  const channel = (status & 0x0f) + 1; // 1..16
  const d1 = raw[1] ?? 0;
  const d2 = raw[2] ?? 0;

  switch (high) {
    case 0x8: {
      // Note Off
      return { type: "noteOff", channel, raw, note: d1, velocity: d2 };
    }
    case 0x9: {
      // Note On (velocity 0 → Note Off)
      if (d2 === 0) return { type: "noteOff", channel, raw, note: d1, velocity: 0 };
      return { type: "noteOn", channel, raw, note: d1, velocity: d2 };
    }
    case 0xA: {
      return { type: "polyAftertouch", channel, raw, note: d1, pressure: d2 };
    }
    case 0xB: {
      const relativeDelta = computeRelativeDelta(d2);
      return {
        type: "controlChange",
        channel,
        raw,
        controller: d1,
        value: d2,
        relativeDelta,
      };
    }
    case 0xC: {
      return { type: "programChange", channel, raw, program: d1 };
    }
    case 0xD: {
      return { type: "channelAftertouch", channel, raw, pressure: d1 };
    }
    case 0xE: {
      const value14 = (d2 << 7) | d1; // LSB (d1) + MSB (d2)
      const normalized = value14 / 16383;
      return { type: "pitchBend", channel, raw, value14, normalized };
    }
    default:
      return { type: "unknown", channel, raw };
  }
}

export function formatDecoded(evt: DecodedMidiEvent): string {
  switch (evt.type) {
    case "noteOn":
      return `NoteOn ch=${evt.channel} note=${evt.note} vel=${evt.velocity}`;
    case "noteOff":
      return `NoteOff ch=${evt.channel} note=${evt.note} vel=${evt.velocity}`;
    case "controlChange": {
      const rel = evt.relativeDelta !== undefined ? ` rel=${evt.relativeDelta}` : "";
      return `CC ch=${evt.channel} cc=${evt.controller} val=${evt.value}${rel}`;
    }
    case "programChange":
      return `Program ch=${evt.channel} pgm=${evt.program}`;
    case "channelAftertouch":
      return `ChAftertouch ch=${evt.channel} press=${evt.pressure}`;
    case "polyAftertouch":
      return `PolyAftertouch ch=${evt.channel} note=${evt.note} press=${evt.pressure}`;
    case "pitchBend":
      return `PitchBend ch=${evt.channel} val14=${evt.value14} norm=${evt.normalized.toFixed(3)}`;
    case "systemExclusive":
      return `SysEx len=${evt.raw.length}`;
    case "systemRealtime":
      return `SystemRealtime status=0x${evt.status.toString(16)}`;
    case "systemCommon":
      return `SystemCommon status=0x${evt.status.toString(16)}`;
    case "unknown":
    default:
      return `Unknown ch=${evt.channel ?? "-"}`;
  }
}
