import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldPack } from "../src/commands/create.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("scaffoldPack", () => {
  it("creates a Python pack with correct structure", () => {
    const result = scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = result.packDir;

    assert.ok(fs.existsSync(path.join(packDir, "manifest.yaml")));
    assert.ok(fs.existsSync(path.join(packDir, "definitions", "example.yaml")));
    assert.ok(fs.existsSync(path.join(packDir, "src", "capabilities.py")));
    assert.ok(fs.existsSync(path.join(packDir, "tests", "test_capabilities.py")));
  });

  it("creates a proxy pack with sync and write executor", () => {
    const result = scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = result.packDir;

    assert.ok(fs.existsSync(path.join(packDir, "manifest.yaml")));
    assert.ok(fs.existsSync(path.join(packDir, "definitions", "example.yaml")));
    assert.ok(fs.existsSync(path.join(packDir, "src", "capabilities.py")));
    assert.ok(fs.existsSync(path.join(packDir, "src", "sync_adapter.py")));
    assert.ok(fs.existsSync(path.join(packDir, "src", "write_executor.py")));
    assert.ok(fs.existsSync(path.join(packDir, "tests", "test_capabilities.py")));
  });

  it("interpolates pack name in manifest", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const manifest = fs.readFileSync(
      path.join(tmpDir, "my-tool", "manifest.yaml"),
      "utf-8"
    );
    assert.ok(manifest.includes("name: my-tool"));
    assert.ok(manifest.includes('version: "1.0.0"'));
    assert.ok(manifest.includes('kruxos_version: ">=0.0.1"'));
  });

  it("interpolates capability prefix in definitions", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const defn = fs.readFileSync(
      path.join(tmpDir, "my-tool", "definitions", "example.yaml"),
      "utf-8"
    );
    assert.ok(defn.includes("name: my_tool.example"));
    assert.ok(!defn.includes("{{capability_prefix}}"));
  });

  it("interpolates capability prefix in Python source", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const src = fs.readFileSync(
      path.join(tmpDir, "my-tool", "src", "capabilities.py"),
      "utf-8"
    );
    assert.ok(src.includes("def my_tool_example("));
    assert.ok(!src.includes("{{capability_prefix}}"));
    assert.ok(!src.includes("{{pack_name}}"));
  });

  it("interpolates class name in proxy sync adapter", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const src = fs.readFileSync(
      path.join(tmpDir, "my-service", "src", "sync_adapter.py"),
      "utf-8"
    );
    assert.ok(src.includes("class MyServiceSyncAdapter:"));
    assert.ok(!src.includes("{{class_name}}"));
  });

  it("interpolates class name in proxy write executor", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const src = fs.readFileSync(
      path.join(tmpDir, "my-service", "src", "write_executor.py"),
      "utf-8"
    );
    assert.ok(src.includes("class MyServiceWriteExecutor:"));
    assert.ok(!src.includes("{{class_name}}"));
  });

  it("sets author and description when provided", () => {
    scaffoldPack("my-tool", {
      type: "python",
      dir: tmpDir,
      author: "Alice",
      description: "A custom tool",
    });
    const manifest = fs.readFileSync(
      path.join(tmpDir, "my-tool", "manifest.yaml"),
      "utf-8"
    );
    assert.ok(manifest.includes('author: "Alice"'));
    assert.ok(manifest.includes('description: "A custom tool"'));
  });

  it("proxy manifest includes secrets and security sections", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const manifest = fs.readFileSync(
      path.join(tmpDir, "my-service", "manifest.yaml"),
      "utf-8"
    );
    assert.ok(manifest.includes("secrets_required:"));
    assert.ok(manifest.includes("network_egress:"));
    assert.ok(manifest.includes("approval_required"));
  });

  it("proxy definition includes query and write capabilities", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const defn = fs.readFileSync(
      path.join(tmpDir, "my-service", "definitions", "example.yaml"),
      "utf-8"
    );
    assert.ok(defn.includes("name: my_service.query"));
    assert.ok(defn.includes("name: my_service.write"));
    assert.ok(defn.includes("permission_tier: autonomous"));
    assert.ok(defn.includes("permission_tier: approval_required"));
  });

  it("rejects invalid pack names", () => {
    assert.throws(
      () => scaffoldPack("My-Pack", { type: "python", dir: tmpDir }),
      /Invalid pack name/
    );
    assert.throws(
      () => scaffoldPack("123abc", { type: "python", dir: tmpDir }),
      /Invalid pack name/
    );
    assert.throws(
      () => scaffoldPack("my pack", { type: "python", dir: tmpDir }),
      /Invalid pack name/
    );
  });

  it("rejects unknown pack type", () => {
    assert.throws(
      () => scaffoldPack("my-tool", { type: "rust", dir: tmpDir }),
      /Unknown pack type/
    );
  });

  it("rejects if directory already exists", () => {
    fs.mkdirSync(path.join(tmpDir, "my-tool"));
    assert.throws(
      () => scaffoldPack("my-tool", { type: "python", dir: tmpDir }),
      /already exists/
    );
  });

  it("definition YAML has all 7 required sections", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const defn = fs.readFileSync(
      path.join(tmpDir, "my-tool", "definitions", "example.yaml"),
      "utf-8"
    );

    const requiredSections = [
      "purpose:",
      "when_to_use:",
      "inputs:",
      "outputs:",
      "side_effects:",
      "common_patterns:",
      "errors:",
    ];
    for (const section of requiredSections) {
      assert.ok(defn.includes(section), `Missing section: ${section}`);
    }
  });

  it("strips -pack suffix from capability prefix", () => {
    scaffoldPack("my-tool-pack", { type: "python", dir: tmpDir });
    const defn = fs.readFileSync(
      path.join(tmpDir, "my-tool-pack", "definitions", "example.yaml"),
      "utf-8"
    );
    // my-tool-pack -> my_tool (stripped _pack suffix)
    assert.ok(defn.includes("name: my_tool.example"));
  });
});
