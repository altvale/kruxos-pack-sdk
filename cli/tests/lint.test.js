import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldPack } from "../src/commands/create.js";
import { lintPack } from "../src/commands/lint.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-lint-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("lintPack", () => {
  it("passes for a valid scaffolded Python pack", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const issues = lintPack({ dir: packDir });
    const errors = issues.filter((i) => i.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors: ${JSON.stringify(errors)}`);
  });

  it("passes for a valid scaffolded proxy pack", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");
    const issues = lintPack({ dir: packDir });
    const errors = issues.filter((i) => i.severity === "error");
    assert.equal(errors.length, 0, `Unexpected errors: ${JSON.stringify(errors)}`);
  });

  it("errors on missing required definition sections", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      "- name: my_tool.example\n  purpose: test\n",
      "utf-8"
    );

    const issues = lintPack({ dir: packDir });
    const errors = issues.filter((i) => i.severity === "error");
    assert.ok(errors.length > 0, "Should detect missing sections");
    assert.ok(
      errors.some((e) => e.message.includes("when_to_use")),
      "Should flag missing when_to_use"
    );
  });

  it("errors on short when_to_use", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      `- name: my_tool.example
  purpose: "A valid purpose description for testing."
  when_to_use: "short"
  inputs: []
  outputs: []
  side_effects: []
  common_patterns:
    - description: "Basic"
      steps:
        - "step"
  errors: []
`,
      "utf-8"
    );

    const issues = lintPack({ dir: packDir });
    const errors = issues.filter((i) => i.severity === "error");
    assert.ok(
      errors.some((e) => e.message.includes("when_to_use is too short")),
      "Should flag short when_to_use"
    );
  });

  it("warns on vague purpose terms", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      `- name: my_tool.example
  purpose: "This is a placeholder purpose that does stuff and needs replacing."
  when_to_use: "Use this when you need to do the thing instead of doing something else."
  inputs: []
  outputs: []
  side_effects: []
  common_patterns:
    - description: "Basic"
      steps:
        - "step"
  errors: []
`,
      "utf-8"
    );

    const issues = lintPack({ dir: packDir });
    const warnings = issues.filter((i) => i.severity === "warning");
    assert.ok(
      warnings.some((w) => w.message.includes("vague term")),
      "Should warn about vague terms"
    );
  });

  it("errors on invalid YAML", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      "{{invalid yaml",
      "utf-8"
    );

    const issues = lintPack({ dir: packDir });
    const errors = issues.filter((i) => i.severity === "error");
    assert.ok(
      errors.some((e) => e.message.includes("Invalid YAML")),
      "Should detect invalid YAML"
    );
  });

  it("errors on missing definition file", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    fs.rmSync(path.join(packDir, "definitions", "example.yaml"));

    const issues = lintPack({ dir: packDir });
    const errors = issues.filter((i) => i.severity === "error");
    assert.ok(
      errors.some((e) => e.message.includes("does not exist")),
      "Should detect missing file"
    );
  });

  it("errors on invalid permission tier in default_policies", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const manifestPath = path.join(packDir, "manifest.yaml");
    let manifest = fs.readFileSync(manifestPath, "utf-8");
    manifest = manifest.replace("autonomous", "invalid_tier");
    fs.writeFileSync(manifestPath, manifest, "utf-8");

    const issues = lintPack({ dir: packDir });
    const errors = issues.filter((i) => i.severity === "error");
    assert.ok(
      errors.some((e) => e.message.includes("invalid tier")),
      "Should detect invalid tier"
    );
  });

  it("warns about empty author", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const issues = lintPack({ dir: packDir });
    const warnings = issues.filter((i) => i.severity === "warning");
    assert.ok(
      warnings.some((w) => w.message.includes("Author field is empty")),
      "Should warn about empty author"
    );
  });

  it("warns about autonomous packs with network egress", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");
    const issues = lintPack({ dir: packDir });
    const warnings = issues.filter((i) => i.severity === "warning");
    assert.ok(
      warnings.some((w) => w.message.includes("autonomous") && w.message.includes("network egress")),
      "Should warn about autonomous + network egress"
    );
  });

  it("throws if no manifest.yaml found", () => {
    assert.throws(
      () => lintPack({ dir: tmpDir }),
      /No manifest\.yaml found/
    );
  });

  it("errors on empty common_patterns", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      `- name: my_tool.example
  purpose: "A sufficiently long purpose for testing."
  when_to_use: "Use this when you need to do the thing instead of doing something else."
  inputs: []
  outputs: []
  side_effects: []
  common_patterns: []
  errors: []
`,
      "utf-8"
    );

    const issues = lintPack({ dir: packDir });
    const errors = issues.filter((i) => i.severity === "error");
    assert.ok(
      errors.some((e) => e.message.includes("common_patterns is empty")),
      "Should detect empty common_patterns"
    );
  });
});
