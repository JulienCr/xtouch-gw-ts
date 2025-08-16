import { describe, it, expect } from "vitest";
import * as xtapi from "../api";
import { centerToLength, sevenSegForChar } from "../seg7";

function makeSink() {
  const sent: number[][] = [];
  const sender: xtapi.RawSender = {
    sendRawMessage(bytes: number[]) {
      sent.push([...bytes]);
    },
  };
  return { sender, sent };
}

describe("xtouch/api primitives", () => {
  it("sendNoteOn encodes channel/note/velocity correctly", () => {
    const { sender, sent } = makeSink();
    xtapi.sendNoteOn(sender, 2, 64, 7);
    expect(sent).toEqual([[0x90 + 1, 64, 7]]);
  });

  it("sendControlChange encodes channel/controller/value correctly", () => {
    const { sender, sent } = makeSink();
    xtapi.sendControlChange(sender, 1, 10, 99);
    expect(sent).toEqual([[0xB0 + 0, 10, 99]]);
  });

  it("sendPitchBend14 encodes 14-bit value", () => {
    const { sender, sent } = makeSink();
    xtapi.sendPitchBend14(sender, 3, 16383);
    expect(sent).toEqual([[0xE0 + 2, 0x7F, 0x7F]]);
  });

  it("resetFadersToZero sends PB=0 for given channels", async () => {
    const { sender, sent } = makeSink();
    await xtapi.resetFadersToZero(sender, [1, 3]);
    expect(sent).toEqual([
      [0xE0 + 0, 0x00, 0x00],
      [0xE0 + 2, 0x00, 0x00],
    ]);
  });

  it("setAllButtonsVelocity iterates over note range", async () => {
    const { sender, sent } = makeSink();
    await xtapi.setAllButtonsVelocity(sender, 1, 10, 12, 5, 0);
    expect(sent).toEqual([
      [0x90 + 0, 10, 5],
      [0x90 + 0, 11, 5],
      [0x90 + 0, 12, 5],
    ]);
  });

  it("sendLcdStripText emits two SysEx frames (upper/lower)", () => {
    const { sender, sent } = makeSink();
    xtapi.sendLcdStripText(sender, 0, "HELLO", "WORLD");
    expect(sent.length).toBe(2);
    expect(sent[0][0]).toBe(0xF0);
    expect(sent[1][0]).toBe(0xF0);
  });

  it("setSevenSegmentText centers text and emits vendor frames", () => {
    const { sender, sent } = makeSink();
    xtapi.setSevenSegmentText(sender, "TEST");
    // Two frames (X‑Touch + Extender) by default
    expect(sent.length).toBe(2);
    expect(sent[0].slice(0, 6)).toEqual([0xF0,0x00,0x20,0x32,0x14,0x37]);
    expect(sent[1].slice(0, 6)).toEqual([0xF0,0x00,0x20,0x32,0x15,0x37]);
  });
});


