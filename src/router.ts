import { logger } from "./logger";
import type { ControlMapping, Driver, ExecutionContext } from "./types";
import type { AppConfig } from "./config";

export class Router {
  private config: AppConfig;
  private readonly drivers: Map<string, Driver> = new Map();
  private activePageIndex = 0;

  constructor(initialConfig: AppConfig) {
    this.config = initialConfig;
  }

  registerDriver(key: string, driver: Driver): void {
    this.drivers.set(key, driver);
  }

  getActivePageName(): string {
    return this.config.pages[this.activePageIndex]?.name ?? "(none)";
  }

  listPages(): string[] {
    return this.config.pages.map((p) => p.name);
  }

  setActivePage(nameOrIndex: string | number): boolean {
    if (typeof nameOrIndex === "number") {
      if (nameOrIndex >= 0 && nameOrIndex < this.config.pages.length) {
        this.activePageIndex = nameOrIndex;
        logger.info(`Page active: ${this.getActivePageName()}`);
        return true;
      }
      return false;
    }
    const idx = this.config.pages.findIndex((p) => p.name === nameOrIndex);
    if (idx >= 0) {
      this.activePageIndex = idx;
      logger.info(`Page active: ${this.getActivePageName()}`);
      return true;
    }
    return false;
  }

  async handleControl(controlId: string, value?: unknown): Promise<void> {
    const page = this.config.pages[this.activePageIndex];
    const mapping = page?.controls?.[controlId] as ControlMapping | undefined;
    if (!mapping) {
      logger.debug(`Aucun mapping pour le contrôle '${controlId}' sur la page '${page?.name}'.`);
      return;
    }
    const driver = this.drivers.get(mapping.app);
    if (!driver) {
      logger.warn(`Driver '${mapping.app}' non enregistré. Action '${mapping.action}' ignorée.`);
      return;
    }
    const context: ExecutionContext = { controlId, value: value as any };
    try {
      await driver.execute(mapping.action, mapping.params ?? [], context);
    } catch (err) {
      logger.error(`Erreur lors de l'exécution '${mapping.app}.${mapping.action}':`, err);
    }
  }

  async updateConfig(next: AppConfig): Promise<void> {
    this.config = next;
    if (this.activePageIndex >= this.config.pages.length) {
      this.activePageIndex = 0;
    }
    for (const d of this.drivers.values()) {
      await d.onConfigChanged?.();
    }
    logger.info("Router: configuration mise à jour.");
  }
}
