import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";

export class ObsDriver implements Driver {
  readonly name = "obs";

  async init(): Promise<void> {
    logger.info("ObsDriver initialisé (stub).");
  }

  async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {
    logger.info(`ObsDriver (stub) → ${action}(${JSON.stringify(params)}) ctx=${JSON.stringify(context)}`);
  }
}
