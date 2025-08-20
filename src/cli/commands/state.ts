import { logger } from "../../logger";
import type { CliContext } from "../types";

export const stateHandlers = {
	async sync(_rest: string[], ctx: CliContext) {
		if (ctx.xtouch) {
			logger.info("Reset de la surface X-Touch...");
			try { const { resetAll } = await import("../../xtouch/api"); await resetAll(ctx.xtouch, { clearLcds: true }); logger.info("Reset terminé"); } catch (err) { logger.error("Erreur lors du reset:", err as any); }
		} else {
			logger.warn("X-Touch non connectée, reset ignoré");
		}
		logger.info("Rechargement des états depuis le snapshot...");
		try {
			const stateRef = (ctx.router as any).state;
			if (stateRef && typeof stateRef.hydrateFromSnapshot === "function") {
				const fs = await import("fs/promises");
				const path = await import("path");
				const snapshotPath = path.resolve(process.cwd(), ".state", "snapshot.json");
				try {
					const raw = await fs.readFile(snapshotPath, { encoding: "utf8" });
					const snap = JSON.parse(raw) as { ts?: number; apps?: Record<string, any[]> };
					const apps = ["voicemeeter", "qlc", "obs", "midi-bridge"] as const;
					if (snap && snap.apps) {
						for (const app of apps) {
							const entries = Array.isArray((snap.apps as any)[app]) ? (snap.apps as any)[app] : [];
							if (entries.length > 0) { stateRef.hydrateFromSnapshot(app, entries); logger.info(`État rechargé pour ${app}: ${entries.length} entrées`); }
						}
						logger.info("Rechargement terminé");
					} else { logger.warn("Snapshot vide ou absent"); }
				} catch (err) { logger.warn("Aucun snapshot ou lecture impossible:", err as any); }
			} else { logger.warn("StateStore non accessible"); }
		} catch (err) { logger.error("Erreur lors du rechargement des états:", err as any); }
		try { logger.info("Synchronisation des drivers..."); await ctx.router.syncDrivers(); logger.info("Drivers synchronisés"); } catch (err) { logger.error("Erreur lors de la synchronisation des drivers:", err as any); }
		try { if (ctx.xtouch) { const { applyLcdForActivePage } = await import("../../ui/lcd"); applyLcdForActivePage(ctx.router, ctx.xtouch); } } catch {}
		try { ctx.router.refreshPage(); } catch {}
	},
	async state(rest: string[], ctx: CliContext) {
		const subcmd = rest[0];
		if (subcmd === "load") {
			logger.info("Rechargement des états depuis le snapshot...");
			try {
				const stateRef = (ctx.router as any).state;
				if (stateRef && typeof stateRef.hydrateFromSnapshot === "function") {
					const fs = await import("fs/promises");
					const path = await import("path");
					const snapshotPath = path.resolve(process.cwd(), ".state", "snapshot.json");
					try {
						const raw = await fs.readFile(snapshotPath, { encoding: "utf8" });
						const snap = JSON.parse(raw) as { ts?: number; apps?: Record<string, any[]> };
						const apps = ["voicemeeter", "qlc", "obs", "midi-bridge"] as const;
						if (snap && snap.apps) {
							for (const app of apps) {
								const entries = Array.isArray((snap.apps as any)[app]) ? (snap.apps as any)[app] : [];
								if (entries.length > 0) { stateRef.hydrateFromSnapshot(app, entries); logger.info(`État rechargé pour ${app}: ${entries.length} entrées`); }
							}
							logger.info("Rechargement terminé");
							logger.info("Synchronisation de la surface X-Touch...");
							try { if (ctx.xtouch) { ctx.router.refreshPage(); logger.info("Surface synchronisée"); } else { logger.warn("X-Touch non connectée, synchronisation impossible"); } } catch (err) { logger.error("Erreur lors de la synchronisation:", err as any); }
							logger.info("Rechargement de la configuration...");
							try {
								const fs2 = await import("fs/promises");
								const path2 = await import("path");
								const configPath = path2.resolve(process.cwd(), "config.yaml");
								try {
									const raw2 = await fs2.readFile(configPath, { encoding: "utf8" });
									const YAML = await import("yaml");
									const newConfig = YAML.parse(raw2);
									if (ctx.router && typeof (ctx.router as any).updateConfig === "function") {
										await (ctx.router as any).updateConfig(newConfig);
										logger.info("Configuration rechargée");
										if (ctx.xtouch) { try { const { applyLcdForActivePage } = await import("../../ui/lcd"); applyLcdForActivePage(ctx.router, ctx.xtouch); logger.info("LCD mis à jour"); } catch (err) { logger.debug("Mise à jour LCD échouée:", err as any); } }
									} else { logger.warn("Méthode updateConfig non disponible"); }
								} catch (err) { logger.error("Erreur lors de la lecture de config.yaml:", err as any); }
							} catch (err) { logger.error("Erreur lors du rechargement de la config:", err as any); }
						} else { logger.warn("Aucun snapshot trouvé"); }
					} catch (err) { logger.error("Erreur lors du rechargement:", err as any); }
				} else { logger.warn("StateStore non accessible"); }
			} catch (err) { logger.error("Erreur lors du rechargement:", err as any); }
		} else if (subcmd === "rm") {
			logger.info("Suppression des états...");
			try {
				const stateRef = (ctx.router as any).state;
				if (stateRef && typeof stateRef.clearAllStates === "function") { stateRef.clearAllStates(); logger.info("États en mémoire supprimés"); }
				else {
					const apps = ["voicemeeter", "qlc", "obs", "midi-bridge"] as const;
					for (const app of apps) { if (stateRef && typeof stateRef.clearStatesForApp === "function") { stateRef.clearStatesForApp(app); } }
					logger.info("États en mémoire supprimés (fallback)");
				}
				logger.info("Suppression des fichiers de persistance...");
				try {
					const fs = await import("fs/promises");
					const path = await import("path");
					const stateDir = path.resolve(process.cwd(), ".state");
					const snapshotPath = path.join(stateDir, "snapshot.json");
					try { await fs.unlink(snapshotPath); logger.info("Snapshot supprimé"); }
					catch (err) { if ((err as any)?.code === 'ENOENT') { logger.info("Snapshot déjà supprimé"); } else { logger.warn("Erreur lors de la suppression du snapshot:", err as any); } }
					try { const files = await fs.readdir(stateDir); if (files.length === 0) { await fs.rmdir(stateDir); logger.info("Répertoire .state supprimé"); } }
					catch (err) { logger.debug("Impossible de supprimer le répertoire .state:", err as any); }
					logger.info("Fichiers de persistance supprimés");
				} catch (err) { logger.error("Erreur lors de la suppression des fichiers:", err as any); }
				if (ctx.xtouch) {
					logger.info("Synchronisation de la surface X-Touch...");
					try { ctx.router.refreshPage(); logger.info("Surface synchronisée (états effacés)"); }
					catch (err) { logger.error("Erreur lors de la synchronisation:", err as any); }
				}
			} catch (err) { logger.error("Erreur lors de la suppression:", err as any); }
		} else {
			logger.warn("Usage: state <load|rm>");
			logger.info("  state load - Recharge les états depuis le snapshot");
			logger.info("  state rm  - Supprime tous les états");
		}
	},
};


