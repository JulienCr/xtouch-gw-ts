import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";

export class VoicemeeterDriver implements Driver {
  readonly name = "voicemeeter";

  async init(): Promise<void> {
    logger.info("VoicemeeterDriver initialisé (stub).");
  }

  async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {
    logger.info(`VoicemeeterDriver (stub) → ${action}(${JSON.stringify(params)}) ctx=${JSON.stringify(context)}`);
  
  }

}
