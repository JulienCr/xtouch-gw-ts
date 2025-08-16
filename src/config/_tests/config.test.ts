import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { findConfigPath, loadConfig } from "../../config";

function yaml(contents: string): string {
  return contents.trimStart();
}

describe("config", () => {
  it("findConfigPath returns the custom path when file exists", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "xtgw-config-"));
    const p = path.join(tmp, "config.yaml");
    await fs.writeFile(p, yaml(`
midi:
  input_port: "in"
  output_port: "out"
pages: []
`), "utf8");
    const found = await findConfigPath(p);
    expect(found).toBe(p);
  });

  it("loadConfig parses YAML and returns structured object", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "xtgw-config-"));
    const p = path.join(tmp, "my-config.yaml");
    await fs.writeFile(p, yaml(`
midi:
  input_port: "XTouch-IN"
  output_port: "XTouch-OUT"
features:
  vm_sync: true
paging:
  channel: 1
  prev_note: 46
  next_note: 47
pages:
  - name: "Default"
    controls: {}
`), "utf8");
    const cfg = await loadConfig(p);
    expect(cfg.midi.input_port).toBe("XTouch-IN");
    expect(cfg.pages.length).toBe(1);
    expect(cfg.pages[0].name).toBe("Default");
  });
});


