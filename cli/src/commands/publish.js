import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import yaml from "js-yaml";
import { lintPack } from "./lint.js";
import { computeFileChecksum } from "../registry-client.js";

const DEFAULT_REGISTRY_REPO = "altvale/kruxos";

export const publishCommand = new Command("publish")
  .description(
    "Validate, build tarball, and prepare submission to community registry"
  )
  .option("--dry-run", "Run validation only, do not build tarball")
  .option("-d, --dir <directory>", "Pack directory", ".")
  .option("--registry-repo <repo>", "Registry GitHub repo (owner/name)", DEFAULT_REGISTRY_REPO)
  .option("--github-token <token>", "GitHub token for automated PR submission (or set GITHUB_TOKEN env)")
  .action(async (opts) => {
    try {
      const result = publishPack(opts);
      if (result.dryRun) {
        console.log("\n  Dry run complete — no tarball built.\n");
        return;
      }

      console.log(`\n  Pack ready for publishing!`);
      console.log(`  Tarball: ${result.tarball}`);
      console.log(`  Checksum (SHA-256): ${result.checksum}`);
      console.log(`  Registry entry: ${result.registryEntry}`);
      console.log(`  Per-pack metadata: ${result.packMetadata}`);
      if (result.securityFlags.length > 0) {
        console.log(`\n  Security flags (will require manual review):`);
        for (const flag of result.securityFlags) {
          console.log(`    - ${flag}`);
        }
      }

      // Attempt automated PR if token available
      const token = opts.githubToken || process.env.GITHUB_TOKEN;
      const registryRepo = opts.registryRepo || DEFAULT_REGISTRY_REPO;
      if (token) {
        console.log(`\n  Step 6: Submitting PR to ${registryRepo}...`);
        const prUrl = await submitRegistryPR(result, token, registryRepo);
        if (prUrl) {
          console.log(`  PR created: ${prUrl}`);
          console.log(`\n  The PR will be validated by CI automatically.`);
          if (result.securityFlags.length > 0) {
            console.log(`  Manual security review is required before merge.`);
          }
          console.log("");
          return;
        }
      }

      // Manual instructions fallback
      printManualInstructions(result, registryRepo);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export function publishPack(opts = {}) {
  const packDir = path.resolve(opts.dir || ".");
  const dryRun = opts.dryRun || false;

  const manifestPath = path.join(packDir, "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `No manifest.yaml found in "${packDir}". Run this from a pack directory or use --dir.`
    );
  }

  const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  if (!manifest || !manifest.name) {
    throw new Error("Invalid manifest.yaml: missing 'name' field.");
  }

  console.log(`\n  KruxOS Pack Publish`);
  console.log(`  ────────────────────`);
  console.log(`  Pack: ${manifest.name} v${manifest.version || "0.0.0"}`);

  // Step 1: Run lint validation
  console.log(`\n  Step 1: Lint validation`);
  const lintIssues = lintPack({ dir: packDir });
  const lintErrors = lintIssues.filter((i) => i.severity === "error");
  if (lintErrors.length > 0) {
    throw new Error(
      `Lint validation failed with ${lintErrors.length} error(s). Fix them before publishing.`
    );
  }
  console.log(`  Lint: passed (${lintIssues.filter((i) => i.severity === "warning").length} warning(s))`);

  // Step 2: Security review
  console.log(`\n  Step 2: Security review`);
  const securityFlags = reviewSecurity(manifest);
  if (securityFlags.length === 0) {
    console.log(`  Security: no flags`);
  } else {
    for (const flag of securityFlags) {
      console.log(`  SECURITY FLAG: ${flag}`);
    }
  }

  if (dryRun) {
    return { dryRun: true, securityFlags, lintWarnings: lintIssues.filter((i) => i.severity === "warning").length };
  }

  // Step 3: Build tarball
  console.log(`\n  Step 3: Building tarball`);
  const tarball = buildTarball(packDir, manifest);
  console.log(`  Tarball: ${tarball.filename} (${tarball.size} bytes)`);

  // Step 4: Compute checksum
  console.log(`\n  Step 4: Computing checksum`);
  const checksum = tarball.checksum;
  console.log(`  SHA-256: ${checksum}`);

  // Step 5: Generate registry submission files
  console.log(`\n  Step 5: Generating registry submission`);
  const { indexEntry, packMetadata, entry } = generateRegistrySubmission(packDir, manifest, tarball, securityFlags);
  console.log(`  Index entry: ${indexEntry}`);
  console.log(`  Pack metadata: ${packMetadata}`);

  return {
    dryRun: false,
    tarball: tarball.filepath,
    tarballFilename: tarball.filename,
    checksum,
    registryEntry: indexEntry,
    packMetadata,
    securityFlags,
    manifest,
    packDir,
    capabilities: entry.capabilities,
  };
}

function reviewSecurity(manifest) {
  const flags = [];

  if (
    manifest.security &&
    manifest.security.network_egress &&
    manifest.security.network_egress.length > 0
  ) {
    flags.push(
      `Pack declares network egress to: ${manifest.security.network_egress.join(", ")}`
    );
  }

  if (manifest.secrets_required && manifest.secrets_required.length > 0) {
    const types = manifest.secrets_required.map((s) => s.type).join(", ");
    flags.push(`Pack requires secrets: ${types}`);
  }

  if (
    manifest.security &&
    manifest.security.filesystem &&
    manifest.security.filesystem !== "workspace_only" &&
    manifest.security.filesystem !== "none"
  ) {
    flags.push(
      `Pack requests filesystem access: ${manifest.security.filesystem}`
    );
  }

  if (
    manifest.security &&
    manifest.security.syscalls &&
    manifest.security.syscalls.length > 0
  ) {
    flags.push(
      `Pack requests additional syscalls: ${manifest.security.syscalls.join(", ")}`
    );
  }

  if (
    manifest.default_policies &&
    manifest.security &&
    manifest.security.network_egress &&
    manifest.security.network_egress.length > 0
  ) {
    for (const [cap, tier] of Object.entries(manifest.default_policies)) {
      if (tier === "autonomous") {
        flags.push(
          `Capability "${cap}" is autonomous with network egress — will require review`
        );
      }
    }
  }

  return flags;
}

function buildTarball(packDir, manifest) {
  const name = manifest.name;
  const version = manifest.version || "0.0.0";
  const filename = `${name}-${version}.tar.gz`;
  const distDir = path.join(packDir, "dist");

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const filepath = path.join(distDir, filename);

  const excludes = [
    "--exclude=dist",
    "--exclude=node_modules",
    "--exclude=__pycache__",
    "--exclude=.git",
    "--exclude=.pytest_cache",
  ].join(" ");

  execSync(
    `tar czf "${filepath}" ${excludes} -C "${path.dirname(packDir)}" "${path.basename(packDir)}"`,
    { encoding: "utf-8" }
  );

  const checksum = computeFileChecksum(filepath);
  const size = fs.statSync(filepath).size;

  return { filepath, filename, checksum, size };
}

function generateRegistrySubmission(packDir, manifest, tarball, securityFlags) {
  const name = manifest.name;
  const version = manifest.version || "0.0.0";

  const entry = {
    name,
    version,
    description: manifest.description || "",
    author: manifest.author || "",
    license: manifest.license || "",
    pack_type: manifest.pack_type || "python",
    minimum_kruxos_version: manifest.minimum_kruxos_version || manifest.kruxos_version || ">=0.0.2",
    // Default to the registry's canonical relative form (pack hosted in-repo
    // under packs/<name>/<version>/). Self-hosters override this with an
    // absolute https:// URL. See the publish output for both paths.
    tarball_url: `${name}/${version}/${tarball.filename}`,
    checksum_sha256: tarball.checksum,
    capabilities: extractCapabilities(packDir, manifest),
    tags: Array.isArray(manifest.tags) ? manifest.tags : [],
    security_review_required: securityFlags.length > 0,
    published_at: new Date().toISOString(),
  };
  if (manifest.homepage) {
    entry.homepage = manifest.homepage;
  }

  const distDir = path.join(packDir, "dist");
  const entryJson = JSON.stringify(entry, null, 2) + "\n";

  const indexEntryFile = `${name}.json`;
  fs.writeFileSync(path.join(distDir, indexEntryFile), entryJson, "utf-8");

  const packMetaFile = `${name}-registry.json`;
  fs.writeFileSync(path.join(distDir, packMetaFile), entryJson, "utf-8");

  return { indexEntry: indexEntryFile, packMetadata: packMetaFile, entry };
}

function extractCapabilities(packDir, manifest) {
  const capabilities = [];
  if (manifest.capabilities && Array.isArray(manifest.capabilities)) {
    for (const capPath of manifest.capabilities) {
      const fullPath = path.join(packDir, capPath);
      if (!fs.existsSync(fullPath)) continue;
      try {
        const defs = yaml.load(fs.readFileSync(fullPath, "utf-8"));
        if (Array.isArray(defs)) {
          for (const def of defs) {
            if (def.name) {
              capabilities.push(def.name);
            }
          }
        }
      } catch {
        // Skip unparseable files
      }
    }
  }
  return capabilities;
}

async function submitRegistryPR(result, token, registryRepo) {
  const apiBase = "https://api.github.com";
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "kruxos-pack-sdk/1.0.0",
  };

  const name = result.manifest.name;
  const version = result.manifest.version || "0.0.0";
  const branchName = `pack/${name}-${version}`;

  try {
    const repoResp = await fetch(`${apiBase}/repos/${registryRepo}`, { headers });
    if (!repoResp.ok) {
      console.error(`  Warning: Could not access ${registryRepo} (HTTP ${repoResp.status}). Falling back to manual instructions.`);
      return null;
    }
    const repoData = await repoResp.json();
    const defaultBranch = repoData.default_branch || "main";

    const refResp = await fetch(`${apiBase}/repos/${registryRepo}/git/ref/heads/${defaultBranch}`, { headers });
    if (!refResp.ok) {
      console.error(`  Warning: Could not get ref for ${defaultBranch}. Falling back to manual instructions.`);
      return null;
    }
    const refData = await refResp.json();
    const baseSha = refData.object.sha;

    const createRefResp = await fetch(`${apiBase}/repos/${registryRepo}/git/refs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });
    if (!createRefResp.ok) {
      const err = await createRefResp.json();
      if (err.message?.includes("Reference already exists")) {
        console.error(`  Warning: Branch ${branchName} already exists. Falling back to manual instructions.`);
      } else {
        console.error(`  Warning: Could not create branch (${err.message}). Falling back to manual instructions.`);
      }
      return null;
    }

    const entryContent = fs.readFileSync(
      path.join(result.packDir, "dist", `${name}.json`),
      "utf-8"
    );

    // Add per-pack metadata file (packs/{name}.json)
    const packFileResp = await fetch(
      `${apiBase}/repos/${registryRepo}/contents/packs/${name}.json`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `Add ${name} v${version}`,
          content: Buffer.from(entryContent).toString("base64"),
          branch: branchName,
        }),
      }
    );
    if (!packFileResp.ok) {
      console.error(`  Warning: Could not create pack file. Falling back to manual instructions.`);
      return null;
    }

    const prBody = [
      `## New pack: ${name} v${version}`,
      "",
      `**Author:** ${result.manifest.author || "Unknown"}`,
      `**Type:** ${result.manifest.pack_type || "python"}`,
      `**Description:** ${result.manifest.description || ""}`,
      "",
      `### Capabilities`,
      ...(result.capabilities || []).map(c => `- \`${c}\``),
      "",
      `### Security`,
      result.securityFlags.length === 0
        ? "No security flags."
        : result.securityFlags.map(f => `- ${f}`).join("\n"),
      "",
      `### Checklist`,
      "- [ ] Tarball uploaded to public HTTPS URL",
      "- [ ] `tarball_url` field updated in pack JSON to point to tarball",
      "- [ ] index.json `packs[]` updated to include this entry (and `updated_at` bumped)",
      result.securityFlags.length > 0 ? "- [ ] Security review completed" : "",
    ].filter(Boolean).join("\n");

    const prResp = await fetch(`${apiBase}/repos/${registryRepo}/pulls`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `Add pack: ${name} v${version}`,
        body: prBody,
        head: branchName,
        base: defaultBranch,
      }),
    });

    if (!prResp.ok) {
      console.error(`  Warning: Could not create PR. Falling back to manual instructions.`);
      return null;
    }

    const prData = await prResp.json();
    return prData.html_url;
  } catch (err) {
    console.error(`  Warning: GitHub API error (${err.message}). Falling back to manual instructions.`);
    return null;
  }
}

function printManualInstructions(result, registryRepo) {
  const name = result.manifest.name;
  const version = result.manifest.version || "0.0.0";

  const tarballName = path.basename(result.tarball);

  console.log(`\n  Two ways to publish — pick one:`);
  console.log(`  ════════════════════════════════`);
  console.log(``);
  console.log(`  A) Submit to the KruxOS community registry  (recommended)`);
  console.log(`     The registry hosts the pack in-repo; tarball_url stays relative.`);
  console.log(`     1. Fork https://github.com/${registryRepo}`);
  console.log(`     2. Add your pack under packs/:`);
  console.log(`          packs/${name}/${version}/${tarballName}   ← the tarball`);
  console.log(`          packs/${name}/source/                     ← your pack source`);
  console.log(`     3. Append dist/${name}.json to packs/index.json's "packs" array`);
  console.log(`        (tarball_url is already the relative "${name}/${version}/${tarballName}")`);
  console.log(`        and bump the top-level "updated_at".`);
  console.log(`     4. Open a PR: "Add pack: ${name} v${version}". CI validates; a maintainer reviews + merges.`);
  console.log(``);
  console.log(`  B) Distribute it yourself  (no registry PR)`);
  console.log(`     Simplest — just share the tarball:`);
  console.log(`       - Hand anyone dist/${tarballName} (it contains manifest + source).`);
  console.log(`       - They install it from the dashboard: /packs -> upload a tarball.`);
  console.log(`       - No public hosting and no tarball_url needed.`);
  console.log(`     Optional — run your own registry:`);
  console.log(`       - Host ${tarballName} at a public HTTPS URL, set "tarball_url" in`);
  console.log(`         dist/${name}.json to it, and have operators point`);
  console.log(`         KRUXOS_PACK_REGISTRY_URL at your index.json.`);
  if (result.securityFlags.length > 0) {
    console.log(``);
    console.log(`  Note: manual security review applies (${result.securityFlags.length} flag(s)).`);
  }
  console.log(``);
  console.log(`  Tip: set GITHUB_TOKEN or use --github-token to automate the path-A PR.`);
  console.log(``);
}
