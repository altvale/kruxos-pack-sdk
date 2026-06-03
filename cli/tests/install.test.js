import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import http from "node:http";
import { installPack } from "../src/commands/install.js";
import { removePack } from "../src/commands/remove.js";

let tmpDir;
let registryDir;
let installDir;
// Ephemeral localhost HTTP server hosting the registry index + tarball.
// resolveTarballUrl already accepts http:// (it only rejects file:// and
// other non-http(s) schemes), so serving fixtures over 127.0.0.1 exercises
// the real download path with no code change and no security loosening.
let server;
let serverPort;
let registryUrl;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-install-"));
  registryDir = path.join(tmpDir, "registry");
  installDir = path.join(tmpDir, "packs");
  fs.mkdirSync(registryDir, { recursive: true });

  // Serve files under registryDir; /index.json maps to the registry index.
  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(
      new URL(req.url, "http://127.0.0.1").pathname
    );
    const filePath = path.join(registryDir, urlPath);
    if (!filePath.startsWith(registryDir) || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200);
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverPort = server.address().port;
  registryUrl = `http://127.0.0.1:${serverPort}/index.json`;
  fs.mkdirSync(path.join(registryDir, "packs", "test-pack", "1.0.0"), {
    recursive: true,
  });
  fs.mkdirSync(installDir, { recursive: true });

  // Create a test pack tarball
  const packDir = path.join(tmpDir, "src-pack");
  fs.mkdirSync(path.join(packDir, "definitions"), { recursive: true });
  fs.mkdirSync(path.join(packDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packDir, "manifest.yaml"),
    'name: test-pack\nversion: "1.0.0"\nauthor: "Test"\ndescription: "A test pack for install testing"\nkruxos_version: ">=0.0.1"\npack_type: python\ncapabilities:\n  - definitions/example.yaml\n',
    "utf-8"
  );
  fs.writeFileSync(
    path.join(packDir, "definitions", "example.yaml"),
    '- name: test_pack.example\n  version: "1.0"\n  purpose: "Test capability for testing install flow."\n  when_to_use: |\n    Use when testing the install workflow end to end.\n  inputs: []\n  outputs: []\n  side_effects: []\n  common_patterns:\n    - description: "Basic test"\n      steps:\n        - "test_pack.example()"\n  errors: []\n  permission_tier: autonomous\n  tags: ["test"]\n',
    "utf-8"
  );
  fs.writeFileSync(
    path.join(packDir, "src", "capabilities.py"),
    "def test_pack_example():\n    return {}\n",
    "utf-8"
  );

  // Create tarball
  const tarPath = path.join(
    registryDir,
    "packs",
    "test-pack",
    "1.0.0",
    "test-pack-1.0.0.tar.gz"
  );
  execSync(
    `tar czf "${tarPath}" -C "${path.dirname(packDir)}" "${path.basename(packDir)}"`,
    { encoding: "utf-8" }
  );

  // Compute checksum
  const hash = createHash("sha256");
  const content = fs.readFileSync(tarPath);
  hash.update(content);
  const checksum = hash.digest("hex");

  // Create registry index (wrapped envelope: {registry_version, updated_at, packs[]})
  const index = {
    registry_version: "1",
    updated_at: "2026-05-26T00:00:00Z",
    packs: [
      {
        name: "test-pack",
        version: "1.0.0",
        description: "A test pack for install testing",
        author: "Test",
        license: "Apache-2.0",
        tarball_url: `http://127.0.0.1:${serverPort}/packs/test-pack/1.0.0/test-pack-1.0.0.tar.gz`,
        checksum_sha256: checksum,
        pack_type: "python",
        minimum_kruxos_version: ">=0.0.2",
        capabilities: ["test_pack.example"],
        tags: ["test"],
        security_review_required: false,
        published_at: "2026-04-05T00:00:00Z",
      },
    ],
  };
  fs.writeFileSync(
    path.join(registryDir, "index.json"),
    JSON.stringify(index),
    "utf-8"
  );

  // Write the index to cache location so install can find it
  const cacheDir = path.join(os.homedir(), ".kruxos", "pack-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, "index.json"),
    JSON.stringify(index),
    "utf-8"
  );
});

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("installPack", () => {
  it("installs a pack from a registry URL", async () => {
    const result = await installPack("test-pack", {
      registryUrl,
      installDir,
    });
    assert.equal(result.name, "test-pack");
    assert.equal(result.version, "1.0.0");
    assert.ok(fs.existsSync(result.installPath));
    assert.ok(
      fs.existsSync(path.join(result.installPath, "manifest.yaml"))
    );
  });

  it("verifies checksum on install", async () => {
    // Record a wrong checksum so the served tarball fails verification.
    const indexPath = path.join(registryDir, "index.json");
    const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    index.packs[0].checksum_sha256 = "0".repeat(64); // Wrong checksum
    fs.writeFileSync(indexPath, JSON.stringify(index), "utf-8");

    // Update cache (fetchIndex reads the file cache before the network)
    const cacheDir = path.join(os.homedir(), ".kruxos", "pack-cache");
    fs.writeFileSync(
      path.join(cacheDir, "index.json"),
      JSON.stringify(index),
      "utf-8"
    );

    await assert.rejects(
      () =>
        installPack("test-pack", {
          registryUrl,
          installDir,
        }),
      /Checksum mismatch/
    );
  });

  it("skips checksum when verify=false", async () => {
    const indexPath = path.join(registryDir, "index.json");
    const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    index.packs[0].checksum_sha256 = "0".repeat(64);
    fs.writeFileSync(indexPath, JSON.stringify(index), "utf-8");

    const cacheDir = path.join(os.homedir(), ".kruxos", "pack-cache");
    fs.writeFileSync(
      path.join(cacheDir, "index.json"),
      JSON.stringify(index),
      "utf-8"
    );

    const result = await installPack("test-pack", {
      registryUrl,
      installDir,
      verify: false,
    });
    assert.equal(result.name, "test-pack");
  });

  it("rejects installing already-installed pack at same version", async () => {
    // Install first
    await installPack("test-pack", {
      registryUrl,
      installDir,
    });

    // Try again
    await assert.rejects(
      () =>
        installPack("test-pack", {
          registryUrl,
          installDir,
        }),
      /already installed/
    );
  });

  it("throws for nonexistent pack", async () => {
    await assert.rejects(
      () =>
        installPack("nonexistent", {
          registryUrl,
          installDir,
        }),
      /not found in the registry/
    );
  });
});

describe("removePack", () => {
  it("removes an installed pack", async () => {
    const result = await installPack("test-pack", {
      registryUrl,
      installDir,
    });
    assert.ok(fs.existsSync(result.installPath));

    const removed = removePack("test-pack", { installDir });
    assert.equal(removed.name, "test-pack");
    assert.ok(!fs.existsSync(result.installPath));
  });

  it("throws for uninstalled pack", () => {
    assert.throws(
      () => removePack("nonexistent", { installDir }),
      /not installed/
    );
  });
});
