import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";

export class QlcDriver implements Driver {
  readonly name = "qlc";

  async init(): Promise<void> {
    logger.info("QlcDriver initialisé (stub).");
  }

  async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {
    logger.info(`QlcDriver (stub) → ${action}(${JSON.stringify(params)}) ctx=${JSON.stringify(context)}`);
  }
}
