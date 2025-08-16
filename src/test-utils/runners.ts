import { logger } from "../logger";
import * as xtapi from "../xtouch/api";
import { playFadersWave, type DeviceMode } from "../animations/wave";
import { playLcdRainbow } from "../animations/lcdRainbow";
import { parseSequence, type Parsed } from "../midi/testDsl";

export interface ButtonsWaveOptions {
  buttonsChannel: number;
  buttonsFirstNote: number;
  buttonsLastNote: number;
  buttonsInterMsgDelayMs: number;
  waveDurationMs: number;
  waveFps: number;
  waveFaderChannels: number[];
  waveCtrlChannel: number;
  waveCtrlCcNumbers: number[];
  deviceMode: DeviceMode;
}

function delay(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

export async function runCustomSequence(sender: xtapi.RawSender, sequence: string[], defaultDelayMs: number, logHex: boolean): Promise<void> {
  const parsed: Parsed[] = parseSequence(sequence, { defaultDelayMs, noteOffAsNoteOn0: true });
  logger.info(`Début de la séquence personnalisée (${parsed.length} commandes)`);
  for (let i = 0; i < parsed.length; i++) {
    const current = parsed[i];
    if (current.kind === "Wait") {
      logger.info(`Attente ${current.ms}ms`);
      await delay(current.ms);
      continue;
    }
    const bytes = current.bytes;
    const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    logger.info(`Envoi [${i + 1}/${parsed.length}]${logHex ? ` ${hex} →` : ":"} ${current.label}`);
    sender.sendRawMessage(bytes);
    const next = parsed[i + 1];
    if (next && next.kind !== "Wait") await delay(defaultDelayMs);
  }
  logger.info("Séquence personnalisée terminée.");
}

export async function runButtonsWave(sender: xtapi.RawSender, opts: ButtonsWaveOptions): Promise<void> {
  const duration = opts.waveDurationMs > 0 ? opts.waveDurationMs : 2000;
  logger.info(`LED+Wave intégré: OFF→(ON+Wave ${duration}ms)→OFF sur notes ${opts.buttonsFirstNote}..${opts.buttonsLastNote}`);
  await xtapi.resetAll(sender, {
    buttonsChannel: opts.buttonsChannel,
    firstNote: opts.buttonsFirstNote,
    lastNote: opts.buttonsLastNote,
    interMessageDelayMs: opts.buttonsInterMsgDelayMs,
    faderChannels: opts.waveFaderChannels,
    clearLcds: true,
  });
  await xtapi.setAllButtonsVelocity(sender, opts.buttonsChannel, opts.buttonsFirstNote, opts.buttonsLastNote, 127, opts.buttonsInterMsgDelayMs);
  if (opts.waveDurationMs > 0) {
    await playFadersWave({
      pb: (ch, v14) => xtapi.sendPitchBend14(sender, ch, v14),
      cc: (ch, cc, val) => xtapi.sendControlChange(sender, ch, cc, val),
    }, {
      mode: opts.deviceMode,
      durationMs: duration,
      fps: opts.waveFps,
      faderChannels: opts.waveFaderChannels,
      ctrlChannel: opts.waveCtrlChannel,
      ctrlCcNumbers: opts.waveCtrlCcNumbers,
    });
  } else {
    await delay(duration);
  }
  await xtapi.resetAll(sender, {
    buttonsChannel: opts.buttonsChannel,
    firstNote: opts.buttonsFirstNote,
    lastNote: opts.buttonsLastNote,
    interMessageDelayMs: opts.buttonsInterMsgDelayMs,
    faderChannels: opts.waveFaderChannels,
    clearLcds: true,
  });
  logger.info("LED+Wave intégré terminé.");
}

export async function runFadersWaveOnly(sender: xtapi.RawSender, opts: Omit<ButtonsWaveOptions, "buttonsChannel"|"buttonsFirstNote"|"buttonsLastNote"|"buttonsInterMsgDelayMs">): Promise<void> {
  logger.info(`Wave faders seul (${opts.deviceMode.toUpperCase()}) pendant ${opts.waveDurationMs}ms …`);
  await playFadersWave({
    pb: (ch, v14) => xtapi.sendPitchBend14(sender, ch, v14),
    cc: (ch, cc, val) => xtapi.sendControlChange(sender, ch, cc, val),
  }, {
    mode: opts.deviceMode,
    durationMs: opts.waveDurationMs,
    fps: opts.waveFps,
    faderChannels: opts.waveFaderChannels,
    ctrlChannel: opts.waveCtrlChannel,
    ctrlCcNumbers: opts.waveCtrlCcNumbers,
  });
  logger.info("Wave terminé. Remise à zéro des faders…");
  await xtapi.resetFadersToZero(sender, opts.waveFaderChannels);
  logger.info("Faders remis à 0.");
}

export interface LcdRainbowRunOptions {
  durationMs: number;
  fps: number;
  stepDelayMs?: number;
}

export async function runLcdRainbow(sender: xtapi.RawSender, opts: LcdRainbowRunOptions): Promise<void> {
  await playLcdRainbow({
    setColors: (colors) => xtapi.setLcdColors(sender, colors),
    setText: (strip, upper, lower) => xtapi.sendLcdStripText(sender, strip, upper, lower),
  }, {
    durationMs: opts.durationMs,
    fps: opts.fps,
    stepDelayMs: opts.stepDelayMs,
    stripCount: 8,
    textUpper: (i) => `LCD #${i+1}`,
    textLower: () => "is ready",
  });
}


