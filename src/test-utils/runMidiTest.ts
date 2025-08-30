import { logger } from "../logger";
import * as xtapi from "../xtouch/api";
import { type DeviceMode } from "../animations/wave";
import { openRawSender } from "./openRawSender";
import { runButtonsWave, runCustomSequence, runFadersWaveOnly, runLcdRainbow } from "./runners";

/** Options de test MIDI pour la séquence et le wave. */
export interface MidiTestOptions {
  portNameFragmentOverride: string | null;
  defaultDelayMs: number;
  logHex: boolean;
  deviceMode: DeviceMode; // surchargé par config.yaml s'il existe
  // Wave
  waveDurationMs: number;
  waveFps: number;
  waveFaderChannels: number[];
  waveCtrlChannel: number;
  waveCtrlCcNumbers: number[];
  // Boutons
  buttonsTestEnabled: boolean;
  buttonsChannel: number;
  buttonsFirstNote: number;
  buttonsLastNote: number;
  buttonsInterMsgDelayMs: number;
  // Séquence custom
  customSequence: string[];
  // Mode de test
  testMode: "all" | "custom" | "buttons" | "faders" | "lcd";
  // LCD rainbow
  lcdDurationMs?: number;
  lcdFps?: number;
  lcdStepDelayMs?: number;
}

const defaultMidiTestOptions: MidiTestOptions = {
  portNameFragmentOverride: null,
  defaultDelayMs: 150,
  logHex: true,
  deviceMode: "mcu",
  waveDurationMs: 1200,
  waveFps: 60,
  waveFaderChannels: [1,2,3,4,5,6,7,8,9],
  waveCtrlChannel: 1,
  waveCtrlCcNumbers: [0,1,2,3,4,5,6,7,8],
  buttonsTestEnabled: true,
  buttonsChannel: 1,
  buttonsFirstNote: 0,
  buttonsLastNote: 101,
  buttonsInterMsgDelayMs: 2,
  customSequence: [],
  testMode: ((process.env.MIDI_TEST_MODE || "all").toLowerCase()) as MidiTestOptions["testMode"],
  lcdDurationMs: 1200,
  lcdFps: 30,
  lcdStepDelayMs: 150,
};

function buildResetOptions(opts: MidiTestOptions) {
  return {
    buttonsChannel: opts.buttonsChannel,
    firstNote: opts.buttonsFirstNote,
    lastNote: opts.buttonsLastNote,
    interMessageDelayMs: opts.buttonsInterMsgDelayMs,
    faderChannels: opts.waveFaderChannels,
    clearLcds: true,
  } as const;
}

async function resetAllSafe(sender: xtapi.RawSender, opts: MidiTestOptions): Promise<void> {
  try { await xtapi.resetAll(sender, buildResetOptions(opts)); } catch {}
}

/**
 * Exécute la pipeline de test MIDI. Utilise le driver X‑Touch si fourni, sinon ouvre un Output brut.
 */
export async function runMidiTest(providedSender?: xtapi.RawSender, override?: Partial<MidiTestOptions>): Promise<void> {
  const opts: MidiTestOptions = { ...defaultMidiTestOptions, ...(override || {}) };

  let sender: xtapi.RawSender | null = providedSender ?? null;
  let cleanup: (() => void) | null = null;
  if (!sender) {
    const opened = await openRawSender({ portNameFragmentOverride: opts.portNameFragmentOverride, defaultDeviceMode: opts.deviceMode });
    if (!opened) return;
    sender = opened.sender;
    cleanup = opened.cleanup;
    opts.deviceMode = opened.deviceMode;
  }

  // Reset initial complet (LED OFF, faders à 0, LCDs nettoyés)
  await resetAllSafe(sender, opts);

  try {
    if (opts.testMode === "all" || opts.testMode === "custom") {
      await runCustomSequence(sender, opts.customSequence, opts.defaultDelayMs, opts.logHex);
    }

    if (opts.buttonsTestEnabled && opts.testMode === "all") {
      await runButtonsWave(sender, {
        buttonsChannel: opts.buttonsChannel,
        buttonsFirstNote: opts.buttonsFirstNote,
        buttonsLastNote: opts.buttonsLastNote,
        buttonsInterMsgDelayMs: opts.buttonsInterMsgDelayMs,
        waveDurationMs: opts.waveDurationMs,
        waveFps: opts.waveFps,
        waveFaderChannels: opts.waveFaderChannels,
        waveCtrlChannel: opts.waveCtrlChannel,
        waveCtrlCcNumbers: opts.waveCtrlCcNumbers,
        deviceMode: opts.deviceMode,
      });
      const lcdOpts = { durationMs: opts.lcdDurationMs ?? 3000, fps: opts.lcdFps ?? 30, stepDelayMs: opts.lcdStepDelayMs };
      await runLcdRainbow(sender, lcdOpts);
    } else if (opts.testMode === "buttons") {

      logger.info(`Boutons: OFF→ON`);
      await xtapi.setAllButtonsVelocity(sender, opts.buttonsChannel, opts.buttonsFirstNote, opts.buttonsLastNote, 0, opts.buttonsInterMsgDelayMs);
      await xtapi.setAllButtonsVelocity(sender, opts.buttonsChannel, opts.buttonsFirstNote, opts.buttonsLastNote, 127, opts.buttonsInterMsgDelayMs);;
      logger.info("Boutons test terminé.");
    } else if (opts.testMode === "faders" && opts.waveDurationMs > 0) {
      await runFadersWaveOnly(sender, {
        waveDurationMs: opts.waveDurationMs,
        waveFps: opts.waveFps,
        waveFaderChannels: opts.waveFaderChannels,
        waveCtrlChannel: opts.waveCtrlChannel,
        waveCtrlCcNumbers: opts.waveCtrlCcNumbers,
        deviceMode: opts.deviceMode,
      });
    } else if (opts.testMode === "lcd") {
      const lcdOpts = { durationMs: opts.lcdDurationMs ?? 3000, fps: opts.lcdFps ?? 30, stepDelayMs: opts.lcdStepDelayMs };
      await runLcdRainbow(sender, lcdOpts);
    }
  } catch (error) {
    logger.error("Erreur lors de l'envoi MIDI:", error as any);
  } finally {
    if (sender) await resetAllSafe(sender, opts);
    try { cleanup?.(); } catch {}
  }
}

