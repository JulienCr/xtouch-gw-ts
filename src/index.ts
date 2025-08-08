import { logger, setLogLevel } from "./logger";
import { findConfigPath, loadConfig, watchConfig } from "./config";

async function main(): Promise<void> {
  // Niveau de log depuis l'environnement
  const envLevel = (process.env.LOG_LEVEL as any) || "info";
  setLogLevel(envLevel);

  logger.info("Initialisation XTouch GW…");

  const configPath = await findConfigPath();
  if (!configPath) {
    logger.warn(
      "Aucun config.yaml trouvé. Créez-en un à la racine ou copiez config.example.yaml."
    );
    return;
  }

  logger.info(`Chargement configuration: ${configPath}`);
  const cfg = await loadConfig(configPath);
  logger.debug("Configuration chargée:", JSON.stringify(cfg, null, 2));

  // Hot reload de la config
  const stop = watchConfig(
    configPath,
    (next) => logger.info("Configuration rechargée."),
    (err) => logger.warn("Erreur hot reload config:", err as any)
  );

  // TODO: Initialiser Router + Drivers ici
  logger.info("Gateway prête (squelette). À implémenter: Router/Drivers.");

  // Sur interruption, fermer watchers proprement
  process.on("SIGINT", () => {
    stop();
    logger.info("Arrêt XTouch GW");
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error("Erreur fatale:", err as any);
  process.exit(1);
}); 