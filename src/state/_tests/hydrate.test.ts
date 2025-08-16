import { describe, it, expect } from "vitest";
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { setupStatePersistence } from "../persistence";
import { StateStore } from "../store";

function fakeRouter(tmpDir: string) {
  const state = new StateStore();
  const origCwd = process.cwd;
  (process as any).cwd = () => tmpDir;
  return { state, restore: () => ((process as any).cwd = origCwd) } as any;
}

describe("state/persistence.hydration", () => {
  it("hydrates store from snapshot at startup and marks entries stale", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "xtgw-hydrate-"));
    const r = fakeRouter(tmp);
    const stateDir = path.join(tmp, ".state");
    await fs.mkdir(stateDir, { recursive: true });
    const snapshotPath = path.join(stateDir, "snapshot.json");
    const now = Date.now();
    const entry = {
      addr: { portId: "qlc", status: "cc", channel: 1, data1: 46 },
      value: 77,
      ts: now - 1000,
      origin: "app",
      known: true,
    } as any;
    const snap = { ts: now, apps: { qlc: [entry] } } as any;
    await fs.writeFile(snapshotPath, JSON.stringify(snap), { encoding: "utf8" });

    const handles = await setupStatePersistence(r as any);
    // entry should be present and marked stale
    const list = (r.state as StateStore).listStatesForApp("qlc" as any);
    expect(list.length).toBe(1);
    expect(list[0].known).toBe(true);
    expect(list[0].stale).toBe(true);

    handles.stopSnapshot();
    handles.unsubState();
    (r as any).restore();
  });
});


