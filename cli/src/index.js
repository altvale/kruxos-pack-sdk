#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { createCommand } from "./commands/create.js";
import { devCommand } from "./commands/dev.js";
import { testCommand } from "./commands/test.js";
import { lintCommand } from "./commands/lint.js";
import { docsCommand } from "./commands/docs.js";
import { publishCommand } from "./commands/publish.js";
import { searchCommand } from "./commands/search.js";
import { installCommand } from "./commands/install.js";
import { removeCommand } from "./commands/remove.js";
import { configCommand } from "./commands/config.js";

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf-8")
);

const program = new Command();

program
  .name("kruxos-pack")
  .description("KruxOS Capability Pack SDK — create, test, and publish packs")
  .version(pkg.version);

program.addCommand(createCommand);
program.addCommand(devCommand);
program.addCommand(testCommand);
program.addCommand(lintCommand);
program.addCommand(docsCommand);
program.addCommand(publishCommand);
program.addCommand(searchCommand);
program.addCommand(installCommand);
program.addCommand(removeCommand);
program.addCommand(configCommand);

program.parse();
