import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { watchConfig, AppConfig } from "../../config";

describe("config.watchConfig", () => {
  it("invokes onChange when file content changes", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "xtgw-watch-"));
    const p = path.join(tmp, "cfg.yaml");
    await fs.writeFile(p, "midi:\n  input_port: in\n  output_port: out\npages: []\n", "utf8");
    let called = 0;
    let lastCfg: AppConfig | null = null;
    const stop = watchConfig(p, (cfg) => { called += 1; lastCfg = cfg; });
    // mutate
    await new Promise((r) => setTimeout(r, 50));
    await fs.writeFile(p, "midi:\n  input_port: in2\n  output_port: out2\npages: []\n", "utf8");
    await new Promise((r) => setTimeout(r, 150));
    stop();
    expect(called).toBeGreaterThan(0);
    expect(lastCfg?.midi.input_port).toBe("in2");
  });
});


