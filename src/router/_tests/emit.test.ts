import { describe, it, expect, vi } from "vitest";
import { makeXTouchEmitter } from "../emit";
import type { MidiStateEntry } from "../../state";

function fakeXTouch() {
  return { sendRawMessage: vi.fn(), squelchPitchBend: vi.fn() } as any;
}

function entry(addr: MidiStateEntry["addr"], value: number): MidiStateEntry {
  return { addr, value, ts: Date.now(), origin: "xtouch", known: true } as MidiStateEntry;
}

describe("router/makeXTouchEmitter", () => {
  it("deduplicates within anti-loop window and orders Notes→CC→PB", () => {
    const x = fakeXTouch();
    const emitter = makeXTouchEmitter(x, {
      antiLoopWindows: { note: 80, cc: 80, pb: 120, sysex: 200 } as any,
      getAddrKeyWithoutPort: (a) => `${a.status}|${a.channel}|${a.data1}`,
    });

    const n = entry({ portId: "xtouch", status: "note", channel: 1, data1: 0 }, 127);
    const c = entry({ portId: "xtouch", status: "cc", channel: 1, data1: 0 }, 1);
    const p = entry({ portId: "xtouch", status: "pb", channel: 1, data1: 0 }, 8192);

    emitter.send([p, c, n]);
    // Order should be Note, CC, PB
    expect(x.sendRawMessage).toHaveBeenCalledTimes(3);
    const calls = (x.sendRawMessage as any).mock.calls.map((c: any) => c[0][0]);
    expect(calls[0] & 0xf0).toBe(0x90); // NoteOn first
    expect(calls[1] & 0xf0).toBe(0xB0); // CC next
    expect(calls[2] & 0xf0).toBe(0xE0); // PB last

    // Duplicate within window should be skipped
    emitter.send([n]);
    expect(x.sendRawMessage).toHaveBeenCalledTimes(3);
  });
});


