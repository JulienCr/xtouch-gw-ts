import { describe, it, expect } from "vitest";
import { decodeMidi, formatDecoded } from "../decoder";

describe("midi/decoder", () => {
  it("decodes note on/off and zero-velocity note-on as note-off", () => {
    const on = decodeMidi([0x90, 0x3c, 0x40]);
    expect(on.type).toBe("noteOn");
    expect(on.channel).toBe(1);
    expect(on.note).toBe(0x3c);
    expect(on.velocity).toBe(0x40);
    const off0 = decodeMidi([0x90, 0x3c, 0x00]);
    expect(off0.type).toBe("noteOff");
    const off = decodeMidi([0x80, 0x3c, 0x10]);
    expect(off.type).toBe("noteOff");
  });

  it("decodes control change and relativeDelta heuristic", () => {
    const ccUp = decodeMidi([0xB0, 10, 5]);
    expect(ccUp.type).toBe("controlChange");
    expect((ccUp as any).relativeDelta).toBe(5);
    const ccDown = decodeMidi([0xB0, 10, 127]);
    expect((ccDown as any).relativeDelta).toBe(-1);
    const ccZero = decodeMidi([0xB0, 10, 0x40]);
    expect((ccZero as any).relativeDelta).toBe(0);
  });

  it("decodes pitch bend with 14-bit value and normalized", () => {
    const pb = decodeMidi([0xE0, 0x00, 0x40]);
    expect(pb.type).toBe("pitchBend");
    expect((pb as any).value14).toBe(8192);
  });

  it("decodes system messages and formats output", () => {
    const syx = decodeMidi([0xF0, 0x01, 0x02, 0xF7]);
    expect(syx.type).toBe("systemExclusive");
    expect(formatDecoded(syx)).toContain("SysEx len=");
    const rt = decodeMidi([0xF8]);
    expect(rt.type).toBe("systemRealtime");
    const sc = decodeMidi([0xF1]);
    expect(sc.type).toBe("systemCommon");
  });
});


