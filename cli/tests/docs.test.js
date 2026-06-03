import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldPack } from "../src/commands/create.js";
import { generateDocs } from "../src/commands/docs.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-docs-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("generateDocs", () => {
  it("generates README.md for a Python pack", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    const result = generateDocs({ dir: packDir });
    assert.equal(result.output, "README.md");
    assert.equal(result.capabilities, 1);

    const readme = fs.readFileSync(path.join(packDir, "README.md"), "utf-8");
    assert.ok(readme.includes("# my-tool"));
    assert.ok(readme.includes("## Capabilities"));
    assert.ok(readme.includes("my_tool.example"));
  });

  it("generates README.md for a proxy pack with two capabilities", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");

    const result = generateDocs({ dir: packDir });
    assert.equal(result.capabilities, 2);

    const readme = fs.readFileSync(path.join(packDir, "README.md"), "utf-8");
    assert.ok(readme.includes("my_service.query"));
    assert.ok(readme.includes("my_service.write"));
    assert.ok(readme.includes("## Security"));
    assert.ok(readme.includes("service-host:443"));
  });

  it("includes input/output tables", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const result = generateDocs({ dir: packDir });
    const readme = result.content;

    assert.ok(readme.includes("#### Inputs"));
    assert.ok(readme.includes("| `input_value` |"));
    assert.ok(readme.includes("#### Outputs"));
    assert.ok(readme.includes("| `result` |"));
  });

  it("includes usage examples from common_patterns", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const result = generateDocs({ dir: packDir });
    const readme = result.content;

    assert.ok(readme.includes("#### Usage Examples"));
    assert.ok(readme.includes("Basic usage"));
  });

  it("includes error table", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const result = generateDocs({ dir: packDir });
    const readme = result.content;

    assert.ok(readme.includes("#### Errors"));
    assert.ok(readme.includes("InvalidInput"));
  });

  it("includes default policies table", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const result = generateDocs({ dir: packDir });
    const readme = result.content;

    assert.ok(readme.includes("## Default Policies"));
    assert.ok(readme.includes("autonomous"));
  });

  it("includes secrets for proxy pack", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");
    const result = generateDocs({ dir: packDir });
    const readme = result.content;

    assert.ok(readme.includes("## Secrets Required"));
    assert.ok(readme.includes("service_credentials"));
  });

  it("writes to custom output file", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    generateDocs({ dir: packDir, output: "DOCS.md" });
    assert.ok(fs.existsSync(path.join(packDir, "DOCS.md")));
  });

  it("includes pack info table", () => {
    scaffoldPack("my-tool", {
      type: "python",
      dir: tmpDir,
      author: "Test Author",
    });
    const packDir = path.join(tmpDir, "my-tool");
    const result = generateDocs({ dir: packDir });
    const readme = result.content;

    assert.ok(readme.includes("## Pack Info"));
    assert.ok(readme.includes("1.0.0"));
    assert.ok(readme.includes("Test Author"));
  });

  it("throws if no manifest.yaml found", () => {
    assert.throws(
      () => generateDocs({ dir: tmpDir }),
      /No manifest\.yaml found/
    );
  });

  it("includes side effects for proxy write capability", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");
    const result = generateDocs({ dir: packDir });
    const readme = result.content;

    assert.ok(readme.includes("#### Side Effects"));
    assert.ok(readme.includes("reversible"));
  });

  it("includes permission tier", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");
    const result = generateDocs({ dir: packDir });
    const readme = result.content;

    assert.ok(readme.includes("**Permission tier:** `autonomous`"));
  });
});
