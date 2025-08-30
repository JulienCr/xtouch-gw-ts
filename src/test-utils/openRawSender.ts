import { Output } from "@julusian/midi";
import { logger } from "../logger";
import { loadConfig, findConfigPath } from "../config";
import { findPortIndexByNameFragment } from "../midi/ports";
import type { RawSender } from "../xtouch/api";
import type { DeviceMode } from "../animations/wave";

export interface OpenRawSenderOptions {
  portNameFragmentOverride: string | null;
  defaultDeviceMode: DeviceMode;
}

export interface OpenRawSenderResult {
  sender: RawSender;
  cleanup: () => void;
  deviceMode: DeviceMode;
}

import { delay } from "../shared/time";

export async function openRawSender(opts: OpenRawSenderOptions): Promise<OpenRawSenderResult | null> {
  const output = new Output();
  const portCount = output.getPortCount();
  logger.info("Ports MIDI de sortie disponibles:");
  for (let i = 0; i < portCount; i++) logger.info(`[${i}] ${output.getPortName(i)}`);
  if (portCount === 0) {
    logger.warn("Aucun port MIDI de sortie détecté.");
    try { output.closePort(); } catch {}
    return null;
  }

  let deviceMode: DeviceMode = opts.defaultDeviceMode;
  let configuredPort = "";
  try {
    const configPath = await findConfigPath();
    if (configPath) {
      const config = await loadConfig(configPath);
      configuredPort = config.midi?.output_port || configuredPort;
      const cfgMode = (config as any)?.xtouch?.mode as DeviceMode | undefined;
      if (cfgMode) deviceMode = cfgMode === "ctrl" ? "ctrl" : "mcu";
      if (configuredPort) logger.info(`Port configuré dans config.yaml: ${configuredPort}`);
      logger.info(`Mode X‑Touch: ${deviceMode.toUpperCase()} (source: config)`);
    }
  } catch {
    logger.warn("Impossible de charger config.yaml, un port sera sélectionné par fragment.");
  }

  const desiredFragment = opts.portNameFragmentOverride ?? configuredPort ?? "";
  const portIndex = desiredFragment ? findPortIndexByNameFragment(output, desiredFragment) : 0;
  if (portIndex === null) {
    logger.error(`Port MIDI "${desiredFragment}" introuvable.`);
    try { output.closePort(); } catch {}
    return null;
  }
  const portName = output.getPortName(portIndex);
  logger.info(`Utilisation du port [${portIndex}] ${portName}`);
  try {
    output.openPort(portIndex);
    logger.info("Port MIDI ouvert avec succès.");
  } catch {
    logger.error("Impossible d'ouvrir le port MIDI (exclusif ou indisponible)");
    try { output.closePort(); } catch {}
    return null;
  }

  const sender: RawSender = { sendRawMessage: (bytes: number[]) => output.sendMessage(bytes) };
  const cleanup = () => { try { output.closePort(); logger.info("Port MIDI fermé."); } catch {} };
  return { sender, cleanup, deviceMode };
}

