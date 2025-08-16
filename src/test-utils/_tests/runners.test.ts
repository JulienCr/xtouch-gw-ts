import { describe, it, expect, vi } from "vitest";
import * as xtapi from "../../xtouch/api";
import { runCustomSequence, runButtonsWave, runFadersWaveOnly, runLcdRainbow } from "../runners";

function makeSink(): { sender: xtapi.RawSender; sent: number[][] } {
  const sent: number[][] = [];
  return {
    sender: { sendRawMessage: (bytes: number[]) => sent.push([...bytes]) },
    sent,
  };
}

describe("test-utils/runners", () => {
  it("runCustomSequence handles Wait and Raw ordering", async () => {
    const { sender, sent } = makeSink();
    const sequence = [
      "CC ch=1 cc=10 value=2",
      "Wait ms=1",
      "NoteOn ch=1 note=0 velocity=1",
    ];
    await runCustomSequence(sender, sequence, 0, false);
    expect(sent).toEqual([
      [0xB0 + 0, 10, 2],
      [0x90 + 0, 0, 1],
    ]);
  });

  it("runFadersWaveOnly emits PB for MCU mode and resets to zero", async () => {
    const { sender, sent } = makeSink();
    const spyReset = vi.spyOn(xtapi, "resetFadersToZero");
    await runFadersWaveOnly(sender, {
      deviceMode: "mcu",
      waveDurationMs: 1,
      waveFps: 60,
      waveFaderChannels: [1],
      waveCtrlChannel: 1,
      waveCtrlCcNumbers: [0],
    });
    expect(spyReset).toHaveBeenCalledWith(sender, [1]);
    spyReset.mockRestore();
    expect(sent.length).toBeGreaterThan(0);
  });

  it("runButtonsWave toggles LEDs and wave then resets", async () => {
    const { sender } = makeSink();
    const spySet = vi.spyOn(xtapi, "setAllButtonsVelocity").mockResolvedValue(undefined);
    const spyResetAll = vi.spyOn(xtapi, "resetAll").mockResolvedValue(undefined);
    await runButtonsWave(sender, {
      buttonsChannel: 1,
      buttonsFirstNote: 0,
      buttonsLastNote: 1,
      buttonsInterMsgDelayMs: 0,
      deviceMode: "ctrl",
      waveDurationMs: 1,
      waveFps: 60,
      waveFaderChannels: [1],
      waveCtrlChannel: 1,
      waveCtrlCcNumbers: [0],
    });
    expect(spySet).toHaveBeenCalledWith(sender, 1, 0, 1, 127, 0);
    expect(spyResetAll).toHaveBeenCalledTimes(2);
    spySet.mockRestore();
    spyResetAll.mockRestore();
  });

  it("runLcdRainbow animates colors and writes text once", async () => {
    const { sender } = makeSink();
    const spyColors = vi.spyOn(xtapi, "setLcdColors").mockImplementation(() => undefined as any);
    const spyText = vi.spyOn(xtapi, "sendLcdStripText").mockImplementation(() => undefined as any);
    await runLcdRainbow(sender, { durationMs: 10, fps: 60, stepDelayMs: 1 });
    expect(spyText).toHaveBeenCalled();
    expect(spyColors).toHaveBeenCalled();
    spyColors.mockRestore();
    spyText.mockRestore();
  });
});


