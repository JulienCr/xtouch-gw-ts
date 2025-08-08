import { startApp } from "./app";
import { logger } from "./logger";

startApp().catch((err) => {
  logger.error("Erreur fatale:", err as any);
  process.exit(1);
}); 