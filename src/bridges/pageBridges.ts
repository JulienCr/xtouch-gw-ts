import type { Router } from "../router";
import type { XTouchDriver } from "../xtouch/driver";
import { MidiBridgeDriver } from "../drivers/midiBridge";
import { resolveAppKey } from "../shared/appKey";
import { logger } from "../logger";

/**
 * Construit et initialise les bridges MIDI pour une liste d'items de passthrough.
 * @param awaitInit Si true, attend l'init; sinon, lance en tâche de fond.
 */
export async function buildPageBridges(
	router: Router,
	x: XTouchDriver,
	items: any[],
	awaitInit: boolean
): Promise<MidiBridgeDriver[]> {
	const bridges: MidiBridgeDriver[] = [];
	for (const item of items) {
		const appKey = resolveAppKey(item?.to_port, item?.from_port);
		const b = new MidiBridgeDriver(
			x,
			item?.to_port,
			item?.from_port,
			item?.filter,
			item?.transform,
			true,
			(appKey2, raw, portId) => router.onMidiFromApp(appKey2, raw, portId)
		);
		bridges.push(b);
		if (awaitInit) {
			await b.init();
		} else {
			b.init().catch((err) => logger.warn("Bridge page init error:", err as any));
		}
	}
	return bridges;
}


