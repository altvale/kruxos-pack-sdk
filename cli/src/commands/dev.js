import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const devCommand = new Command("dev")
  .description(
    "Local dev environment (coming in v0.0.3) — for now, validate with `kruxos-pack test`"
  )
  .option("-d, --dir <directory>", "Pack directory", ".")
  .action((opts) => {
    try {
      startDevEnvironment(opts);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export function startDevEnvironment(opts = {}) {
  const packDir = path.resolve(opts.dir || ".");

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

  // The full local dev environment (run your pack inside KruxOS with hot-reload)
  // is planned for v0.0.3 — see kruxos-core #513. It will reuse the published
  // appliance image with a headless/dev mode rather than a separate image.
  console.log(`\n  kruxos-pack dev — not available yet`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  A local dev environment (run your pack inside KruxOS with`);
  console.log(`  hot-reload) is planned for v0.0.3.`);
  console.log(``);
  console.log(`  For now, validate your pack without a KruxOS instance:`);
  console.log(`    kruxos-pack lint     # check the capability definitions`);
  console.log(`    kruxos-pack test     # run schema checks + your tests`);
  console.log(``);

  return { deferred: true, packDir, packName: manifest.name };
}
