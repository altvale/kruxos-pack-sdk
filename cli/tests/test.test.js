import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldPack } from "../src/commands/create.js";
import { runTests } from "../src/commands/test.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("runTests — schema validation", () => {
  it("passes for a valid scaffolded pack", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const results = runTests({ dir: packDir, schemaOnly: true });
    const failures = results.filter((r) => !r.passed);
    assert.equal(failures.length, 0, `Unexpected failures: ${JSON.stringify(failures)}`);
  });

  it("passes schema for a proxy pack", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");
    const results = runTests({ dir: packDir, schemaOnly: true });
    const failures = results.filter((r) => !r.passed);
    assert.equal(failures.length, 0, `Unexpected failures: ${JSON.stringify(failures)}`);
  });

  it("detects missing required manifest fields", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const manifestPath = path.join(packDir, "manifest.yaml");
    // Write a minimal invalid manifest
    fs.writeFileSync(manifestPath, "name: my-tool\n", "utf-8");

    const results = runTests({ dir: packDir, schemaOnly: true });
    const failures = results.filter((r) => !r.passed);
    assert.ok(failures.length > 0, "Should detect missing fields");
    const failNames = failures.map((f) => f.name);
    assert.ok(
      failNames.some((n) => n.includes("version")),
      "Should flag missing version"
    );
  });

  it("detects missing definition file", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    // Remove the definition file
    fs.rmSync(path.join(packDir, "definitions", "example.yaml"));

    const results = runTests({ dir: packDir, schemaOnly: true });
    const failures = results.filter((r) => !r.passed);
    assert.ok(
      failures.some((f) => f.name.includes("capability file exists")),
      "Should detect missing definition file"
    );
  });

  it("detects invalid YAML in definitions", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      "{{invalid yaml: [",
      "utf-8"
    );

    const results = runTests({ dir: packDir, schemaOnly: true });
    const failures = results.filter((r) => !r.passed);
    assert.ok(
      failures.some((f) => f.name.includes("valid YAML")),
      "Should detect invalid YAML"
    );
  });

  it("validates definition required sections", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    // Write a definition missing several sections
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      "- name: my_tool.example\n  purpose: test\n",
      "utf-8"
    );

    const results = runTests({ dir: packDir, schemaOnly: true });
    const failures = results.filter((r) => !r.passed);
    assert.ok(
      failures.some((f) => f.name.includes("has when_to_use")),
      "Should detect missing when_to_use"
    );
  });
});

describe("runTests — docs completeness", () => {
  it("passes docs check for scaffolded pack", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const results = runTests({ dir: packDir, docsOnly: true });
    const failures = results.filter((r) => !r.passed);
    assert.equal(failures.length, 0, `Unexpected failures: ${JSON.stringify(failures)}`);
  });

  it("detects short purpose", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      `- name: my_tool.example
  purpose: "Short"
  when_to_use: "This is a long enough when_to_use description for testing purposes."
  inputs: []
  outputs: []
  side_effects: []
  common_patterns:
    - description: "Basic"
      steps:
        - "Do something"
  errors: []
`,
      "utf-8"
    );

    const results = runTests({ dir: packDir, docsOnly: true });
    const failures = results.filter((r) => !r.passed);
    assert.ok(
      failures.some((f) => f.name.includes("purpose is descriptive")),
      "Should detect short purpose"
    );
  });
});

describe("runTests — error handling", () => {
  it("throws if no manifest.yaml found", () => {
    assert.throws(
      () => runTests({ dir: tmpDir }),
      /No manifest\.yaml found/
    );
  });
});
