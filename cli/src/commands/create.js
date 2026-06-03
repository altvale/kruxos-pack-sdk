import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");

const PACK_TYPES = ["python", "proxy"];

export const createCommand = new Command("create")
  .description("Scaffold a new capability pack")
  .argument("<name>", "Pack name (lowercase, hyphens allowed)")
  .option("-t, --type <type>", `Pack type: ${PACK_TYPES.join(", ")}`, "python")
  .option("-d, --dir <directory>", "Parent directory for the pack", ".")
  .option("--author <author>", "Pack author name", "")
  .option("--description <desc>", "Pack description", "")
  .action((name, opts) => {
    try {
      const result = scaffoldPack(name, opts);
      console.log(`\n✔ Pack "${name}" created at ${result.packDir}`);
      console.log(`  Type: ${opts.type}`);
      console.log(`\nNext steps:`);
      console.log(`  cd ${result.packDir}`);
      console.log(`  kruxos-pack dev     # Start local dev environment`);
      console.log(`  kruxos-pack test    # Run tests`);
      console.log(`  kruxos-pack lint    # Check documentation standard\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export function scaffoldPack(name, opts = {}) {
  const packType = opts.type || "python";
  const parentDir = opts.dir || ".";
  const author = opts.author || "";
  const description = opts.description || `${name} capability pack for KruxOS`;

  if (!isValidPackName(name)) {
    throw new Error(
      `Invalid pack name "${name}". Use lowercase letters, numbers, and hyphens only.`
    );
  }

  if (!PACK_TYPES.includes(packType)) {
    throw new Error(
      `Unknown pack type "${packType}". Valid types: ${PACK_TYPES.join(", ")}`
    );
  }

  const packDir = path.resolve(parentDir, name);

  if (fs.existsSync(packDir)) {
    throw new Error(`Directory "${packDir}" already exists.`);
  }

  fs.mkdirSync(packDir, { recursive: true });

  const templateDir = path.resolve(TEMPLATES_DIR, packType);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }

  copyTemplateDir(templateDir, packDir, { name, author, description });

  const manifestPath = path.join(packDir, "manifest.yaml");
  const manifest = generateManifest(name, packType, { author, description });
  fs.writeFileSync(manifestPath, manifest, "utf-8");

  return { packDir, packType };
}

function isValidPackName(name) {
  return /^[a-z][a-z0-9-]*$/.test(name) && name.length <= 64;
}

function copyTemplateDir(srcDir, destDir, vars) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplateDir(srcPath, destPath, vars);
    } else {
      let content = fs.readFileSync(srcPath, "utf-8");
      content = interpolate(content, vars);
      fs.writeFileSync(destPath, content, "utf-8");
    }
  }
}

function interpolate(text, vars) {
  const capPrefix = vars.name.replace(/-/g, "_").replace(/_pack$/, "");
  const className = capPrefix
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

  return text
    .replace(/\{\{pack_name\}\}/g, vars.name)
    .replace(/\{\{author\}\}/g, vars.author)
    .replace(/\{\{description\}\}/g, vars.description)
    .replace(/\{\{capability_prefix\}\}/g, capPrefix)
    .replace(/\{\{class_name\}\}/g, className);
}

function generateManifest(name, packType, { author, description }) {
  const capPrefix = name.replace(/-/g, "_").replace(/_pack$/, "");
  const isProxy = packType === "proxy";

  let manifest = `name: ${name}
version: "1.0.0"
author: "${author}"
description: "${description}"
kruxos_version: ">=0.0.1"
pack_type: ${packType}

capabilities:
  - definitions/example.yaml

dependencies: []
`;

  if (isProxy) {
    manifest += `
secrets_required:
  - type: service_credentials
    description: "Credentials for the external service"

security:
  network_egress:
    - "service-host:443"
  filesystem: workspace_only
  syscalls: []

default_policies:
  ${capPrefix}.query: autonomous
  ${capPrefix}.write: approval_required
`;
  } else {
    manifest += `
secrets_required: []

security:
  network_egress: []
  filesystem: workspace_only
  syscalls: []

default_policies:
  ${capPrefix}.example: autonomous
`;
  }

  return manifest;
}
