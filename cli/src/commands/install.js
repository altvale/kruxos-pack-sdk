import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { execSync } from "node:child_process";
import yaml from "js-yaml";
import { getConfigValue, DEFAULT_INSTALL_DIR } from "./config.js";
import {
  fetchIndex,
  getDefaultRegistryUrl,
  computeFileChecksum,
  resolveTarballUrl,
  CACHE_DIR,
} from "../registry-client.js";

export const installCommand = new Command("install")
  .description("Install a pack from the community registry")
  .argument("<name>", "Pack name to install")
  .option("--version <version>", "Specific version to install (default: latest)")
  .option(
    "--registry-url <url>",
    "Registry index URL",
    getDefaultRegistryUrl()
  )
  .option(
    "--install-dir <dir>",
    "Installation directory",
    DEFAULT_INSTALL_DIR
  )
  .option("--no-verify", "Skip checksum verification")
  .action(async (name, opts) => {
    try {
      const result = await installPack(name, opts);
      console.log(`\n  Installed ${result.name} v${result.version}`);
      console.log(`  Location: ${result.installPath}`);
      console.log(`  Capabilities: ${result.capabilities.join(", ")}`);
      console.log("");
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export async function installPack(name, opts = {}) {
  const registryUrl = opts.registryUrl || getDefaultRegistryUrl();
  const installDir = opts.installDir || getConfigValue("install_dir") || DEFAULT_INSTALL_DIR;
  const verify = opts.verify !== false;
  const targetVersion = opts.version || null;

  const index = await fetchIndex(registryUrl);
  const entry = findPack(index, name, targetVersion);

  const packInstallDir = path.join(installDir, entry.name);
  const existingManifest = path.join(packInstallDir, "manifest.yaml");
  try {
    const manifest = yaml.load(fs.readFileSync(existingManifest, "utf-8"));
    if (manifest && manifest.version === entry.version) {
      throw new Error(
        `${entry.name} v${entry.version} is already installed at ${packInstallDir}`
      );
    }
  } catch (err) {
    if (err.message.includes("already installed")) throw err;
  }

  console.log(`  Downloading ${entry.name} v${entry.version}...`);
  // DECISION-1812: tarball_url may be relative (canonical) or absolute.
  // Resolve against the registry URL before fetching so preview /
  // mirror deployments work without env-var sprawl.
  const resolvedTarballUrl = resolveTarballUrl(registryUrl, entry.tarball_url);
  const tarballPath = await downloadTarball(
    resolvedTarballUrl,
    entry.name,
    entry.version,
  );

  if (verify) {
    console.log(`  Verifying checksum...`);
    const actualChecksum = computeFileChecksum(tarballPath);
    if (actualChecksum !== entry.checksum_sha256) {
      fs.unlinkSync(tarballPath);
      throw new Error(
        `Checksum mismatch!\n` +
        `  Expected: ${entry.checksum_sha256}\n` +
        `  Actual:   ${actualChecksum}\n` +
        `  The download may be corrupted or tampered with.`
      );
    }
  }

  console.log(`  Installing to ${packInstallDir}...`);
  fs.rmSync(packInstallDir, { recursive: true, force: true });
  fs.mkdirSync(packInstallDir, { recursive: true });

  execSync(
    `tar xzf "${tarballPath}" -C "${packInstallDir}" --strip-components=1`,
    { encoding: "utf-8" }
  );

  fs.unlinkSync(tarballPath);

  return {
    name: entry.name,
    version: entry.version,
    installPath: packInstallDir,
    capabilities: entry.capabilities || [],
  };
}

function findPack(index, name, targetVersion) {
  const packs = unwrapPacks(index);

  const matches = packs.filter((entry) => entry.name === name);
  if (matches.length === 0) {
    throw new Error(
      `Pack "${name}" not found in the registry.\n` +
      `  Use 'kruxos-pack search ${name}' to find available packs.`
    );
  }

  if (targetVersion) {
    const exact = matches.find((e) => e.version === targetVersion);
    if (!exact) {
      const available = matches.map((e) => e.version).join(", ");
      throw new Error(
        `Pack "${name}" version "${targetVersion}" not found.\n` +
        `  Available versions: ${available}`
      );
    }
    return exact;
  }

  // Return the latest version (last entry or sorted by semver)
  matches.sort((a, b) => compareSemver(a.version, b.version));
  return matches[matches.length - 1];
}

// Registry index is a wrapped envelope: {registry_version, updated_at, packs[]}.
// See docs/internal/pack-registry.md for the schema.
function unwrapPacks(index) {
  if (index && typeof index === "object" && Array.isArray(index.packs)) {
    return index.packs;
  }
  throw new Error(
    "Registry index has an unexpected shape; expected " +
    "{registry_version, updated_at, packs[]}."
  );
}

function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) {
      return (pa[i] || 0) - (pb[i] || 0);
    }
  }
  return 0;
}

async function downloadTarball(url, name, version) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tarballPath = path.join(CACHE_DIR, `${name}-${version}.tar.gz`);

  // resolveTarballUrl guarantees `url` is http(s) before we get here.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: HTTP ${response.status} ${response.statusText}`
    );
  }

  const fileStream = createWriteStream(tarballPath);
  await pipeline(Readable.fromWeb(response.body), fileStream);

  return tarballPath;
}

