import { describe, it, expect, vi } from "vitest";
import { Router } from "../../router";

function cfgWithControl() {
  return {
    midi: { input_port: "xtouch", output_port: "xtouch" },
    pages: [
      { name: "P1", controls: { test: { app: "qlc", action: "do", params: [1, 2] } }, passthroughs: [] },
    ],
  } as any;
}

describe("router/handleControl & updateConfig", () => {
  it("handleControl invokes driver.execute with params when mapping exists", async () => {
    const r = new Router(cfgWithControl());
    const drv = { execute: vi.fn().mockResolvedValue(undefined) } as any;
    r.registerDriver("qlc", drv);
    await r.handleControl("test", 42);
    expect(drv.execute).toHaveBeenCalledWith("do", [1, 2], { controlId: "test", value: 42 });
  });

  it("handleControl with missing driver does not throw", async () => {
    const r = new Router(cfgWithControl());
    await r.handleControl("test");
    expect(true).toBe(true);
  });

  it("updateConfig resets active page index if out of bounds and calls onConfigChanged of drivers", async () => {
    const r = new Router({ midi: { input_port: "x", output_port: "x" }, pages: [{ name: "A", controls: {} }, { name: "B", controls: {} }] } as any);
    const changed = vi.fn();
    r.registerDriver("qlc", { onConfigChanged: changed } as any);
    // Move to page B then shrink to one page
    r.setActivePage(1);
    await r.updateConfig({ midi: { input_port: "x", output_port: "x" }, pages: [{ name: "A", controls: {} }] } as any);
    expect(r.getActivePageName()).toBe("A");
    expect(changed).toHaveBeenCalled();
  });

  it("markAppShadowForOutgoing handles raw midi without throwing", () => {
    const r = new Router({ midi: { input_port: "x", output_port: "x" }, pages: [{ name: "A", controls: {} }] } as any);
    expect(() => r.markAppShadowForOutgoing("qlc", [0xB0, 46, 1], "qlc-out")).not.toThrow();
  });
});


