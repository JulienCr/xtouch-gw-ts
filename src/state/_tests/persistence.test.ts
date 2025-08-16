import { describe, it, expect, vi } from "vitest";
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { setupStatePersistence } from "../persistence";
import { StateStore } from "../store";

function fakeRouter(tmpDir: string) {
  const state = new StateStore();
  // override cwd to tmpDir for this test
  const origCwd = process.cwd;
  (process as any).cwd = () => tmpDir;
  return { state, restore: () => ((process as any).cwd = origCwd) } as any;
}

describe("state/persistence.setupStatePersistence", () => {
  it("writes journal on state updates and snapshot periodically", async () => {
    vi.useFakeTimers();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "xtgw-state-"));
    const r = fakeRouter(tmp);
    const handles = await setupStatePersistence(r as any);
    // push one event
    (r.state as StateStore).updateFromFeedback("qlc", {
      addr: { portId: "qlc", status: "cc", channel: 1, data1: 46 },
      value: 1,
      ts: Date.now(),
      origin: "app",
      known: true,
    } as any);
    // let journal flush (advance fake timers)
    await vi.advanceTimersByTimeAsync(10);
    const journal = await fs.readFile(path.join(tmp, ".state", "journal.log"), "utf8");
    expect(journal).toContain("\"op\":\"upsert\"");
    // advance to trigger snapshot interval and give I/O a tick
    await vi.advanceTimersByTimeAsync(5000);
    // Try a few times to allow async I/O to complete under fake timers
    let snapshot = "";
    for (let i = 0; i < 3; i += 1) {
      try {
        snapshot = await fs.readFile(path.join(tmp, ".state", "snapshot.json"), "utf8");
      } catch {
        snapshot = "";
      }
      if (snapshot.includes("\"apps\"")) break;
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(snapshot).toContain("\"apps\"");
    handles.stopSnapshot();
    handles.unsubState();
    (r as any).restore();
    vi.useRealTimers();
  });
});


