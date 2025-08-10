import type { MidiFilterConfig } from "../config";

/**
 * Détermine si un message MIDI brut satisfait le filtre donné.
 */
export function matchFilter(data: number[], filter?: MidiFilterConfig): boolean {
  if (!filter) return true;
  const status = data[0] ?? 0;
  const typeNibble = (status & 0xf0) >> 4;
  const ch = ((status & 0x0f) + 1) as number; // 1..16

  if (filter.channels && !filter.channels.includes(ch)) return false;

  const isNoteOn = typeNibble === 0x9 && (data[2] ?? 0) > 0;
  const isNoteOff = typeNibble === 0x8 || (typeNibble === 0x9 && (data[2] ?? 0) === 0);
  const isCC = typeNibble === 0xB;
  const isPB = typeNibble === 0xE;
  const isProg = typeNibble === 0xC;
  const isChAT = typeNibble === 0xD;
  const isPolyAT = typeNibble === 0xA;

  const typeName = isNoteOn
    ? "noteOn"
    : isNoteOff
    ? "noteOff"
    : isCC
    ? "controlChange"
    : isPB
    ? "pitchBend"
    : isProg
    ? "programChange"
    : isChAT
    ? "channelAftertouch"
    : isPolyAT
    ? "polyAftertouch"
    : undefined;

  if (filter.types && (!typeName || !filter.types.includes(typeName))) return false;

  if ((isNoteOn || isNoteOff) && filter.includeNotes) {
    const note = data[1] ?? 0;
    if (!filter.includeNotes.includes(note)) return false;
  }
  if ((isNoteOn || isNoteOff) && filter.excludeNotes) {
    const note = data[1] ?? 0;
    if (filter.excludeNotes.includes(note)) return false;
  }

  return true;
}


