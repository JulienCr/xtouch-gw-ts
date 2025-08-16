import { describe, it, expect } from "vitest";
import { resolveAppKey, resolveAppKeyFromPort } from "../appKey";

describe("shared/appKey", () => {
  it("resolveAppKey detects qlc, voicemeeter/xtouch-gw, obs, default midi-bridge", () => {
    expect(resolveAppKey("QLC-In", "qlc-out")).toBe("qlc");
    expect(resolveAppKey("xtouch-gw", "feedback")).toBe("voicemeeter");
    expect(resolveAppKey("vm-out", "Voicemeeter-Return")).toBe("voicemeeter");
    expect(resolveAppKey("OBS Studio", "websocket" as any)).toBe("obs");
    expect(resolveAppKey("Some Port", "Other" as any)).toBe("midi-bridge");
  });

  it("resolveAppKeyFromPort maps single port names similarly", () => {
    expect(resolveAppKeyFromPort("qlc-foo")).toBe("qlc");
    expect(resolveAppKeyFromPort("XTOUCH-GW OUT")).toBe("voicemeeter");
    expect(resolveAppKeyFromPort("OBS Camera")).toBe("obs");
    expect(resolveAppKeyFromPort("Random Port")).toBe("midi-bridge");
  });
});


