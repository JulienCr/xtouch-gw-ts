import { describe, it, expect, vi } from "vitest";

vi.mock("@julusian/midi", () => {
  const __inputs: any[] = [];
  class Input {
    names = ["IN-1", "IN-2"];
    handler: any = null;
    constructor() { __inputs.push(this); }
    getPortCount() { return this.names.length; }
    getPortName(i: number) { return this.names[i]; }
    closePort() {}
    ignoreTypes() {}
    on(ev: string, cb: any) { if (ev === "message") this.handler = cb; }
    openPort(_i: number) {}
    trigger(msg: number[]) { this.handler?.(0.123, msg); }
  }
  return { Input, __inputs };
});

import { listInputPorts, MidiInputSniffer } from "../sniffer";

describe("midi/sniffer", () => {
  it("lists input ports", () => {
    const ports = listInputPorts();
    expect(ports.length).toBe(2);
    expect(ports[1].name).toBe("IN-2");
  });

  it("opens by name and forwards decoded messages to handler", async () => {
    const onMsg = vi.fn();
    const s = new MidiInputSniffer(onMsg);
    const ok = s.openByName("IN-2");
    expect(ok).toBe(true);
    const midiMod: any = await import("@julusian/midi");
    const inst = midiMod.__inputs.at(-1);
    inst.trigger([0x90, 0, 1]);
    expect(onMsg).toHaveBeenCalled();
    s.close();
  });
});


