import type { Router } from "../../router";
import type { AppConfig } from "../../config";
import { logger } from "../../logger";
import { startXInputProvider, type GamepadProvider } from "./provider-xinput";
import { startHidProvider } from "./provider-hid";
import { attachGamepadMapper } from "./mapper";

export interface AttachGamepadOptions {
  router: Router;
  config: AppConfig;
}

/**
 * Initialise l'entrée Gamepad selon la config (Windows: XInput) et attache le mapper → Router.
 * Retourne une fonction de nettoyage.
 */
export async function attachGamepad(opts: AttachGamepadOptions): Promise<() => void> {
  const { router, config } = opts;
  const gpCfg = (config as any).gamepad || {};
  const providerName = String(gpCfg.provider || "xinput");

  let provider: GamepadProvider | null = null;
  if (providerName === "xinput") {
    provider = await startXInputProvider({
      deviceIndex: Number(gpCfg.device_index) | 0,
      sampleHz: Number(gpCfg.sample_hz) | 0 || 60,
      deadzone: typeof gpCfg.deadzone === "number" ? gpCfg.deadzone : 0.15,
      triggerThreshold: typeof gpCfg.trigger_threshold === "number" ? gpCfg.trigger_threshold : 0.5,
    });
  } else if (providerName === "hid") {
    const hidCfg = (gpCfg as any).hid || {};
    provider = await startHidProvider({
      productMatch: typeof hidCfg.product_match === "string" ? hidCfg.product_match : undefined,
      vendorId: Number(hidCfg.vendor_id) || undefined,
      productId: Number(hidCfg.product_id) || undefined,
      path: typeof hidCfg.path === "string" ? hidCfg.path : undefined,
      mappingCsvPath: typeof hidCfg.mapping_csv === "string" ? hidCfg.mapping_csv : undefined,
    });
  } else {
    logger.warn(`Gamepad: provider '${providerName}' non supporté. Aucun input attaché.`);
    return () => {};
  }

  const detachMapper = attachGamepadMapper({ router, provider });
  logger.info("Gamepad: attaché (provider=%s)", providerName);
  return () => { try { detachMapper(); } catch {} try { provider?.stop(); } catch {} };
}
