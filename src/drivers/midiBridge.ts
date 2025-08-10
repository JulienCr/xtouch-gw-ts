import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";
import type { XTouchDriver } from "../xtouch/driver";
import type { MidiFilterConfig, TransformConfig } from "../config";
import { decodeMidi, formatDecoded } from "../midi/decoder";

function findPortIndexByNameFragment<T extends Input | Output>(
  device: T,
  nameFragment: string
): number | null {
  const needle = nameFragment.trim().toLowerCase();
  const count = device.getPortCount();
  for (let i = 0; i < count; i += 1) {
    const name = device.getPortName(i) ?? "";
    if (name.toLowerCase().includes(needle)) return i;
  }
  return null;
}

function hex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}
function parseNumberMaybeHex(value: number | string | undefined, fallback: number): number {
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

function human(bytes: number[]): string {
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


function matchFilter(data: number[], filter?: MidiFilterConfig): boolean {
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

export class MidiBridgeDriver implements Driver {
  readonly name = "midi-bridge";
  private outToTarget: Output | null = null;
  private inFromTarget: Input | null = null;
  private unsubXTouch?: () => void;

  constructor(
    private readonly xtouch: XTouchDriver,
    private readonly toPort: string,
    private readonly fromPort: string,
    private readonly filter?: MidiFilterConfig,
    private readonly transform?: TransformConfig,
    private readonly optional: boolean = true
  ) {}

  async init(): Promise<void> {
    try {
      const out = new Output();
      const outIdx = findPortIndexByNameFragment(out, this.toPort);
      if (outIdx == null) {
        out.closePort?.();
        if (this.optional) {
          logger.warn(`MidiBridge: port OUT introuvable '${this.toPort}' (optional).`);
        } else {
          throw new Error(`Port OUT introuvable pour '${this.toPort}'`);
        }
      } else {
        out.openPort(outIdx);
        this.outToTarget = out;
      }

      const inp = new Input();
      const inIdx = findPortIndexByNameFragment(inp, this.fromPort);
      if (inIdx == null) {
        inp.closePort?.();
        if (this.optional) {
          logger.warn(`MidiBridge: port IN introuvable '${this.fromPort}' (optional).`);
        } else {
          throw new Error(`Port IN introuvable pour '${this.fromPort}'`);
        }
      } else {
        inp.ignoreTypes(false, false, false);
        inp.on("message", (_delta, data) => {
          logger.debug(`Bridge RX <- ${this.fromPort}: ${human(data)} [${hex(data)}]`);
          try {
            const txToXTouch = this.applyReverseTransform(data);
            if (!txToXTouch) {
              logger.debug(`Bridge DROP (reverse transformed to null) -> X-Touch: ${human(data)} [${hex(data)}]`);
              return;
            }
            logger.debug(`Bridge RX transform -> X-Touch: ${human(txToXTouch)} [${hex(txToXTouch)}]`);
            this.xtouch.sendRawMessage(txToXTouch);
          } catch (err) {
            logger.warn("Bridge reverse send error:", err as any);
          }
        });
        inp.openPort(inIdx);
        this.inFromTarget = inp;
      }

      if (this.outToTarget) {
        this.unsubXTouch = this.xtouch.subscribe((_delta, data) => {
          try {
            if (matchFilter(data, this.filter)) {
              const tx = this.applyTransform(data);
              if (!tx) {
                logger.debug(`Bridge DROP (transformed to null) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
                return;
              }
              logger.debug(`Bridge TX -> ${this.toPort}: ${human(tx)} [${hex(tx)}]`);
              this.outToTarget?.sendMessage(tx);
            } else {
              logger.debug(`Bridge DROP (filtered) -> ${this.toPort}: ${human(data)} [${hex(data)}]`);
            }
          } catch (err) {
            logger.warn("Bridge send error:", err as any);
          }
        });
      }

      logger.info(`MidiBridge: '${this.toPort}' ⇄ '${this.fromPort}' actif.`);
    } catch (err) {
      if (!this.optional) throw err;
      logger.warn("MidiBridge init (optional) ignoré:", err as any);
    }
  }

  async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {}

  async shutdown(): Promise<void> {
    try { this.inFromTarget?.closePort(); } catch {}
    try { this.outToTarget?.closePort(); } catch {}
    this.inFromTarget = null;
    this.outToTarget = null;
    this.unsubXTouch?.();
    this.unsubXTouch = undefined;
    logger.info("MidiBridge arrêté.");
  }

  private applyTransform(data: number[]): number[] | null {
    const t = this.transform;
    if (!t) return data;
    // PitchBend → NoteOn transformation
    if (t.pb_to_note) {
      const status = data[0] ?? 0;
      const typeNibble = (status & 0xf0) >> 4;
      if (typeNibble === 0xE) {
        const channelNibble = status & 0x0f; // 0..15
        const lsb = data[1] ?? 0; // 0..127
        const msb = data[2] ?? 0; // 0..127
        const value14 = (msb << 7) | lsb; // 0..16383
        // Map 14-bit value to 0..127 velocity (round)
        const velocity = Math.round((value14 / 16383) * 127);
        const note = Math.max(0, Math.min(127, t.pb_to_note.note ?? 0));
        const noteOnStatus = 0x90 | channelNibble;
        // Send a Note On with computed velocity. We do NOT emit Note Off; QLC+ typically treats value as level.
        return [noteOnStatus, note, velocity];
      }
    }
    // PitchBend → ControlChange transformation
    if (t.pb_to_cc) {
      const status = data[0] ?? 0;
      const typeNibble = (status & 0xf0) >> 4;
      if (typeNibble === 0xE) {
        const srcChannel0 = status & 0x0f; // 0..15
        const srcChannel1 = srcChannel0 + 1; // 1..16
        const lsb = data[1] ?? 0;
        const msb = data[2] ?? 0;
        const value14 = (msb << 7) | lsb; // 0..16383
        const value7 = Math.round((value14 / 16383) * 127);
        const targetChannel1 = Math.max(1, Math.min(16, t.pb_to_cc.target_channel ?? 1));
        const targetChannel0 = targetChannel1 - 1;
        // Resolve CC number
        let ccRaw: number | string | undefined = t.pb_to_cc.cc_by_channel?.[srcChannel1];
        if (ccRaw === undefined) {
          const baseRaw = t.pb_to_cc.base_cc ?? 45; // default base (one less than ch1 CC)
          const base = parseNumberMaybeHex(baseRaw, 45);
          // Mapping rule: cc = base + channel (so ch1 → base+1)
          ccRaw = base + srcChannel1;
        }
        let cc = parseNumberMaybeHex(ccRaw, 0);
        cc = Math.max(0, Math.min(127, cc));
        const ccStatus = 0xB0 | targetChannel0;
        return [ccStatus, cc, value7];
      }
    }
    return data;
  }

  private applyReverseTransform(data: number[]): number[] | null {
    const t = this.transform;
    if (!t) return data;
    const status = data[0] ?? 0;
    const typeNibble = (status & 0xf0) >> 4;
    const ch0 = status & 0x0f; // 0..15
    const ch1 = ch0 + 1; // 1..16

    // Reverse for pb_to_note: Note -> PitchBend
    if (t.pb_to_note) {
      const noteCfg = Math.max(0, Math.min(127, t.pb_to_note.note ?? 0));
      if (typeNibble === 0x9) { // Note On
        const note = data[1] ?? 0;
        const vel = data[2] ?? 0;
        if (note === noteCfg) {
          const value14 = Math.round((vel / 127) * 16383);
          const lsb = value14 & 0x7f;
          const msb = (value14 >> 7) & 0x7f;
          const pbStatus = 0xE0 | ch0;
          return [pbStatus, lsb, msb];
        }
      }
      if (typeNibble === 0x8) { // Note Off → PB 0
        const note = data[1] ?? 0;
        if (note === noteCfg) {
          const pbStatus = 0xE0 | ch0;
          return [pbStatus, 0x00, 0x00];
        }
      }
    }

    // Reverse for pb_to_cc: CC -> PitchBend
    if (t.pb_to_cc && typeNibble === 0xB) {
      // Only consider feedback from the configured target channel if provided
      const targetCh = t.pb_to_cc.target_channel ? Math.max(1, Math.min(16, t.pb_to_cc.target_channel)) : undefined;
      if (!targetCh || targetCh === ch1) {
        const ccNum = data[1] ?? 0;
        const val7 = data[2] ?? 0;
        // Find src channel
        let srcCh1: number | undefined;
        if (t.pb_to_cc.cc_by_channel) {
          // Find key whose value matches ccNum (accept hex strings)
          for (const [k, v] of Object.entries(t.pb_to_cc.cc_by_channel)) {
            const vNum = parseNumberMaybeHex(v, -1);
            if (vNum === ccNum) {
              const kNum = Number(k);
              if (Number.isFinite(kNum) && kNum >= 1 && kNum <= 16) {
                srcCh1 = kNum;
                break;
              }
            }
          }
        }
        if (srcCh1 === undefined) {
          const baseRaw = t.pb_to_cc.base_cc ?? 45;
          const base = parseNumberMaybeHex(baseRaw, 45);
          // Forward used: cc = base + srcChannel1
          // Reverse: srcChannel1 = cc - base
          const candidate = ccNum - base;
          if (candidate >= 1 && candidate <= 16) srcCh1 = candidate;
        }
        if (srcCh1) {
          const value14 = Math.round((val7 / 127) * 16383);
          const lsb = value14 & 0x7f;
          const msb = (value14 >> 7) & 0x7f;
          const pbStatus = 0xE0 | ((srcCh1 - 1) & 0x0f);
          return [pbStatus, lsb, msb];
        }
      }
    }
    return data;
  }
}
