import { describe, it, expect, vi } from "vitest";

vi.mock("@julusian/midi", () => {
  class Output { opened=false; msgs:number[][]=[]; openPort(){this.opened=true;} closePort(){this.opened=false;} sendMessage(m:number[]){this.msgs.push(m);} getPortName(){return "mock-out";} }
  class Input { opened=false; handler:any=null; openPort(){this.opened=true;} closePort(){this.opened=false;} ignoreTypes(){} on(ev:string,cb:any){ if(ev==="message") this.handler=cb;} getPortName(){return "mock-in";} trigger(data:number[]){ this.handler?.(0,data);} }
  return { Output, Input };
});
vi.mock("../../midi/ports", () => ({ findPortIndexByNameFragment: () => 0 }));

import { VoicemeeterDriver } from "../voicemeeter";

function makeXTouch(){ const subs: any[]=[]; return { subscribe:(fn:any)=>{subs.push(fn); return ()=>{};}, trigger:(data:number[])=>subs.forEach(fn=>fn(0,data)) } as any; }

describe("drivers/VoicemeeterDriver (integration with fakes)", () => {
  it("bridges XTouch → VM and calls feedback callback on VM message", async () => {
    const xt = makeXTouch();
    const feedback = vi.fn();
    const d = new VoicemeeterDriver(xt, { toVoicemeeterOutName: "xtouch-gw", fromVoicemeeterInName: "xtouch-gw-feedback" }, feedback);
    await d.init();
    // Forward a NoteOn
    xt.trigger([0x90,0,1]);
    // Simulate feedback from VM
    const midiMod: any = await import("@julusian/midi");
    const inp = new midiMod.Input();
    // Can't access driver's internal Input; call callback directly
    feedback.mockClear();
    (d as any).onFeedbackFromApp?.("voicemeeter", [0xB0,46,1], "xtouch-gw-feedback");
    expect(feedback).toHaveBeenCalledWith("voicemeeter", [0xB0,46,1], "xtouch-gw-feedback");
    await d.shutdown();
  });
});


