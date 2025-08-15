import { promises as fs } from "fs";
import path from "path";
import type { Router } from "../router";

export type PersistenceHandles = {
	unsubState: () => void;
	stopSnapshot: () => void;
};

/**
 * Configure une persistance légère du state: journal append-only + snapshot périodique.
 */
export async function setupStatePersistence(router: Router): Promise<PersistenceHandles> {
	const stateDir = path.resolve(process.cwd(), ".state");
	const journalPath = path.join(stateDir, "journal.log");
	const snapshotPath = path.join(stateDir, "snapshot.json");
	try { await fs.mkdir(stateDir, { recursive: true }); } catch {}
	const stateRef = (router as any).state as import("../state").StateStore | undefined;
	const persistQueue: string[] = [];
	let writing = false;
	async function flushJournal() {
		if (writing || persistQueue.length === 0) return;
		writing = true;
		try {
			const chunk = persistQueue.splice(0, persistQueue.length).join("");
			await fs.appendFile(journalPath, chunk, { encoding: "utf8" });
		} catch {}
		writing = false;
	}
	function onStateUpsert(entry: import("../state").MidiStateEntry, app: import("../state").AppKey) {
		const rec = { op: "upsert", app, addr: entry.addr, value: entry.value, ts: entry.ts, origin: entry.origin, known: entry.known };
		persistQueue.push(JSON.stringify(rec) + "\n");
		flushJournal().catch(() => {});
	}
	let unsubState = () => {};
	if (stateRef && typeof stateRef.subscribe === "function") {
		unsubState = stateRef.subscribe(onStateUpsert);
	}
	const snapshotTimer = setInterval(async () => {
		try {
			const dump: any = {};
			for (const app of ["voicemeeter","qlc","obs","midi-bridge"]) {
				dump[app] = stateRef?.listStatesForApp(app as any) ?? [];
			}
			await fs.writeFile(snapshotPath, JSON.stringify({ ts: Date.now(), apps: dump }), { encoding: "utf8" });
		} catch {}
	}, 5000);
	return {
		unsubState,
		stopSnapshot: () => { try { clearInterval(snapshotTimer); } catch {} },
	};
}


