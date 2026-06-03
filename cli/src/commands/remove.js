import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_INSTALL_DIR } from "./config.js";

export const removeCommand = new Command("remove")
  .description("Remove an installed pack")
  .argument("<name>", "Pack name to remove")
  .option(
    "--install-dir <dir>",
    "Installation directory",
    DEFAULT_INSTALL_DIR
  )
  .action((name, opts) => {
    try {
      const result = removePack(name, opts);
      console.log(`\n  Removed ${result.name} from ${result.path}\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export function removePack(name, opts = {}) {
  const installDir = opts.installDir || DEFAULT_INSTALL_DIR;
  const packDir = path.join(installDir, name);

  if (!fs.existsSync(packDir)) {
    throw new Error(
      `Pack "${name}" is not installed at ${packDir}.\n` +
      `  Use 'kruxos-pack list' to see installed packs.`
    );
  }

  fs.rmSync(packDir, { recursive: true, force: true });

  return { name, path: packDir };
}
