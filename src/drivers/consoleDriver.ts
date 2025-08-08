import { logger } from "../logger";
import type { Driver, ExecutionContext } from "../types";

export class ConsoleDriver implements Driver {
  readonly name = "console";

  async init(): Promise<void> {
    logger.info("ConsoleDriver initialisé.");
  }

  async execute(action: string, params: unknown[], context?: ExecutionContext): Promise<void> {
    logger.info(`ConsoleDriver → action='${action}' params=${JSON.stringify(params)} context=${JSON.stringify(context)}`);
  }

  async sendInitialFeedback(): Promise<void> {
    logger.debug("ConsoleDriver: sendInitialFeedback");
  }
}
