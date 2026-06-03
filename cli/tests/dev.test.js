import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startDevEnvironment } from "../src/commands/dev.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-dev-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("startDevEnvironment", () => {
  it("throws if no manifest.yaml found", () => {
    assert.throws(
      () => startDevEnvironment({ dir: tmpDir }),
      /No manifest\.yaml found/
    );
  });

  it("throws if manifest has no name", () => {
    fs.writeFileSync(path.join(tmpDir, "manifest.yaml"), "version: 1.0.0\n");
    assert.throws(
      () => startDevEnvironment({ dir: tmpDir }),
      /missing 'name' field/
    );
  });

  it("returns deferred for a valid manifest (dev env lands in v0.0.3)", () => {
    fs.writeFileSync(
      path.join(tmpDir, "manifest.yaml"),
      "name: my-tool\nversion: 1.0.0\n"
    );
    const r = startDevEnvironment({ dir: tmpDir });
    assert.equal(r.deferred, true);
    assert.equal(r.packName, "my-tool");
  });
});
