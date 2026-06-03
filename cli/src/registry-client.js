/**
 * Shared registry client — fetches and caches the pack registry index.
 * Used by both search and install commands.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { getConfigValue } from "./commands/config.js";

export const CACHE_DIR = path.join(os.homedir(), ".kruxos", "pack-cache");
const CACHE_FILE = path.join(CACHE_DIR, "index.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Override hook resolution order (highest precedence first):
//   1. KRUXOS_PACK_REGISTRY_URL env var (dev override)
//   2. registry_url in ~/.kruxos/pack-config.json (persistent override)
//   3. compiled-in DEFAULT_REGISTRY_URL (commands/config.js)
// The Rust CLI mirrors this in cli/src/commands/pack.rs::resolve_registry_url.
export const REGISTRY_URL_ENV_VAR = "KRUXOS_PACK_REGISTRY_URL";

export function getDefaultRegistryUrl() {
  const fromEnv = process.env[REGISTRY_URL_ENV_VAR];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return getConfigValue("registry_url");
}

/**
 * Fetch the registry index, using a 1-hour file cache.
 * Falls back to stale cache if the remote is unreachable.
 */
export async function fetchIndex(registryUrl, useCache = true) {
  // Check cache first
  if (useCache && fs.existsSync(CACHE_FILE)) {
    const stat = fs.statSync(CACHE_FILE);
    const age = Date.now() - stat.mtimeMs;
    if (age < CACHE_TTL_MS) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
  }

  // Fetch from remote
  let index;
  try {
    const response = await fetch(registryUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    index = await response.json();
  } catch (err) {
    // Fall back to cache if available
    if (fs.existsSync(CACHE_FILE)) {
      console.error(
        `  Warning: Could not fetch registry (${err.message}), using cached index.`
      );
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
    throw new Error(
      `Could not fetch registry index from ${registryUrl}: ${err.message}`
    );
  }

  // Update cache
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(index, null, 2), "utf-8");

  return index;
}

/**
 * Resolve a pack entry's tarball_url to an absolute URL, against the
 * registry URL that produced it (DECISION-1812).
 *
 * tarball_url may be:
 *   - relative (canonical) e.g. "kruxos-hashutils/1.0.0/kruxos-hashutils-1.0.0.tar.gz"
 *     → resolved against the directory of registryUrl
 *   - absolute https:// or http:// → passes through unchanged
 * Anything else (file://, scheme-less but containing "://", empty) throws.
 *
 * Mirrors `kruxos_packs::resolve_tarball_url` on the Rust side; keep in sync.
 */
export function resolveTarballUrl(registryUrl, tarballUrl) {
  if (!tarballUrl) {
    throw new Error("tarball_url is empty");
  }
  if (tarballUrl.startsWith("https://") || tarballUrl.startsWith("http://")) {
    return tarballUrl;
  }
  if (tarballUrl.includes("://")) {
    throw new Error(
      `tarball_url scheme is not http(s): "${tarballUrl}" — refusing`
    );
  }
  const lastSlash = registryUrl.lastIndexOf("/");
  if (lastSlash < 0) {
    throw new Error(
      `registry URL "${registryUrl}" has no parent directory; cannot resolve relative tarball_url`
    );
  }
  const parent = registryUrl.slice(0, lastSlash);
  const stripped = tarballUrl.startsWith("/")
    ? tarballUrl.slice(1)
    : tarballUrl;
  return `${parent}/${stripped}`;
}

/**
 * Compute SHA-256 checksum of a file. Used by install (verify) and publish (build).
 */
export function computeFileChecksum(filepath) {
  const hash = createHash("sha256");
  const fd = fs.openSync(filepath, "r");
  const buf = Buffer.alloc(64 * 1024);
  let bytesRead;
  while ((bytesRead = fs.readSync(fd, buf)) > 0) {
    hash.update(buf.subarray(0, bytesRead));
  }
  fs.closeSync(fd);
  return hash.digest("hex");
}
