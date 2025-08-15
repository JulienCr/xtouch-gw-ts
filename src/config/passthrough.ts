import type { PageConfig } from "../config";

/**
 * Retourne un tableau d'items passthrough indépendamment du format (legacy `passthrough` ou `passthroughs`).
 */
export function getPagePassthroughItems(page: PageConfig | undefined): any[] {
	if (!page) return [];
	return (page as any).passthroughs ?? ((page as any).passthrough ? [(page as any).passthrough] : []);
}


