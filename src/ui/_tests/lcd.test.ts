import { describe, it, expect, vi } from "vitest";
import { applyLcdForActivePage } from "../lcd";

function fakeRouter(labels?: any, colors?: any, name: string = "P1") {
  return {
    getActivePage: () => ({ lcd: { labels, colors }, name }),
    getActivePageName: () => name,
  } as any;
}

function fakeX() {
  return {
    sendLcdStripText: vi.fn(),
    setLcdColors: vi.fn(),
    setSevenSegmentText: vi.fn(),
  } as any;
}

describe("ui/lcd.applyLcdForActivePage", () => {
  it("clears strips and applies string labels with newline", () => {
    const r = fakeRouter(["UP\nLOW"]); // only index 0 provided
    const x = fakeX();
    applyLcdForActivePage(r, x);
    expect(x.sendLcdStripText).toHaveBeenCalledWith(0, "UP", "LOW");
    expect(x.setSevenSegmentText).toHaveBeenCalledWith("P1");
  });

  it("applies object labels and colors clamped 0..7", () => {
    const r = fakeRouter([{ upper: "A", lower: "B" }], [9, "3", -1]);
    const x = fakeX();
    applyLcdForActivePage(r, x);
    expect(x.sendLcdStripText).toHaveBeenCalledWith(0, "A", "B");
    expect(x.setLcdColors).toHaveBeenCalled();
  });
});


