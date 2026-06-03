import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".kruxos");
const CONFIG_FILE = path.join(CONFIG_DIR, "pack-config.json");

export const DEFAULT_REGISTRY_URL = "https://docs.kruxos.com/packs/index.json";
export const DEFAULT_INSTALL_DIR = "/data/kruxos/packs";

const DEFAULTS = {
  registry_url: DEFAULT_REGISTRY_URL,
  install_dir: DEFAULT_INSTALL_DIR,
};

const VALID_KEYS = Object.keys(DEFAULTS);

export const configCommand = new Command("config")
  .description("Manage pack SDK configuration");

configCommand
  .command("set")
  .description("Set a configuration value")
  .argument("<key>", `Configuration key (${VALID_KEYS.join(", ")})`)
  .argument("<value>", "Configuration value")
  .action((key, value) => {
    if (!VALID_KEYS.includes(key)) {
      console.error(`Error: Unknown key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
      process.exit(1);
    }
    const config = loadConfig();
    config[key] = value;
    saveConfig(config);
    console.log(`  Set ${key} = ${value}`);
  });

configCommand
  .command("get")
  .description("Get a configuration value")
  .argument("<key>", "Configuration key")
  .action((key) => {
    const config = loadConfig();
    const value = config[key] || DEFAULTS[key];
    if (value === undefined) {
      console.error(`Error: Unknown key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
      process.exit(1);
    }
    console.log(value);
  });

configCommand
  .command("list")
  .description("List all configuration values")
  .action(() => {
    const config = loadConfig();
    console.log("\n  Pack SDK Configuration:");
    console.log("  ───────────────────────");
    for (const key of VALID_KEYS) {
      const value = config[key] || DEFAULTS[key];
      const isDefault = !(key in config);
      console.log(`  ${key} = ${value}${isDefault ? " (default)" : ""}`);
    }
    console.log("");
  });

configCommand
  .command("reset")
  .description("Reset configuration to defaults")
  .action(() => {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    console.log("  Configuration reset to defaults.");
  });

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getConfigValue(key) {
  const config = loadConfig();
  return config[key] || DEFAULTS[key];
}
