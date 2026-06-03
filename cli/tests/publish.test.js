import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldPack } from "../src/commands/create.js";
import { publishPack } from "../src/commands/publish.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-publish-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("publishPack", () => {
  it("dry run validates without building tarball", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    const result = publishPack({ dir: packDir, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.ok(Array.isArray(result.securityFlags));
    assert.equal(result.securityFlags.length, 0);
  });

  it("builds tarball and generates registry entry", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    const result = publishPack({ dir: packDir });
    assert.equal(result.dryRun, false);
    assert.ok(result.tarball.endsWith("my-tool-1.0.0.tar.gz"));
    assert.ok(fs.existsSync(result.tarball));
    assert.match(result.checksum, /^[a-f0-9]{64}$/);
    assert.equal(result.registryEntry, "my-tool.json");
  });

  it("registry entry JSON has correct structure", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    publishPack({ dir: packDir });
    const entryPath = path.join(packDir, "dist", "my-tool.json");
    assert.ok(fs.existsSync(entryPath));

    const entry = JSON.parse(fs.readFileSync(entryPath, "utf-8"));
    assert.equal(entry.name, "my-tool");
    assert.equal(entry.version, "1.0.0");
    assert.ok(entry.checksum_sha256.length === 64);
    assert.ok(entry.tarball_url.includes("my-tool-1.0.0.tar.gz"));
    assert.ok(Array.isArray(entry.capabilities));
    assert.ok(entry.capabilities.includes("my_tool.example"));
    assert.equal(entry.security_review_required, false);
  });

  it("flags security for proxy packs with network egress", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");

    const result = publishPack({ dir: packDir, dryRun: true });
    assert.ok(result.securityFlags.length > 0);
    assert.ok(
      result.securityFlags.some((f) => f.includes("network egress")),
      "Should flag network egress"
    );
  });

  it("flags security for packs with secrets", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");

    const result = publishPack({ dir: packDir, dryRun: true });
    assert.ok(
      result.securityFlags.some((f) => f.includes("secrets")),
      "Should flag secrets requirement"
    );
  });

  it("flags autonomous capability with network egress", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");

    const result = publishPack({ dir: packDir, dryRun: true });
    assert.ok(
      result.securityFlags.some(
        (f) => f.includes("autonomous") && f.includes("network egress")
      ),
      "Should flag autonomous + network egress"
    );
  });

  it("proxy pack registry entry marks security_review_required", () => {
    scaffoldPack("my-service", { type: "proxy", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-service");

    publishPack({ dir: packDir });
    const entryPath = path.join(packDir, "dist", "my-service.json");
    const entry = JSON.parse(fs.readFileSync(entryPath, "utf-8"));
    assert.equal(entry.security_review_required, true);
    assert.ok(entry.capabilities.includes("my_service.query"));
    assert.ok(entry.capabilities.includes("my_service.write"));
  });

  it("throws if no manifest.yaml found", () => {
    assert.throws(
      () => publishPack({ dir: tmpDir }),
      /No manifest\.yaml found/
    );
  });

  it("throws if lint fails", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    // Break a definition to cause lint errors
    fs.writeFileSync(
      path.join(packDir, "definitions", "example.yaml"),
      "- name: bad\n",
      "utf-8"
    );

    assert.throws(
      () => publishPack({ dir: packDir }),
      /Lint validation failed/
    );
  });

  it("generates both index entry and per-pack metadata files", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    const result = publishPack({ dir: packDir });
    assert.ok(result.registryEntry);
    assert.ok(result.packMetadata);

    // Both files should exist in dist/
    const indexEntryPath = path.join(packDir, "dist", result.registryEntry);
    const packMetaPath = path.join(packDir, "dist", result.packMetadata);
    assert.ok(fs.existsSync(indexEntryPath));
    assert.ok(fs.existsSync(packMetaPath));

    // Both should have identical content (same entry for index and per-pack)
    const indexEntry = JSON.parse(fs.readFileSync(indexEntryPath, "utf-8"));
    const packMeta = JSON.parse(fs.readFileSync(packMetaPath, "utf-8"));
    assert.equal(indexEntry.name, packMeta.name);
    assert.equal(indexEntry.checksum_sha256, packMeta.checksum_sha256);
  });

  it("publish result includes manifest for PR automation", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    const result = publishPack({ dir: packDir });
    assert.ok(result.manifest);
    assert.equal(result.manifest.name, "my-tool");
    assert.equal(result.manifest.version, "1.0.0");
  });

  it("publish result includes tarballFilename", () => {
    scaffoldPack("my-tool", { type: "python", dir: tmpDir });
    const packDir = path.join(tmpDir, "my-tool");

    const result = publishPack({ dir: packDir });
    assert.ok(result.tarballFilename);
    assert.equal(result.tarballFilename, "my-tool-1.0.0.tar.gz");
  });
});
