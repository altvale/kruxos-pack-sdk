import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, saveConfig, getConfigValue } from "../src/commands/config.js";

const CONFIG_DIR = path.join(os.homedir(), ".kruxos");
const CONFIG_FILE = path.join(CONFIG_DIR, "pack-config.json");
let backupExists = false;
let backupContent;

beforeEach(() => {
  if (fs.existsSync(CONFIG_FILE)) {
    backupExists = true;
    backupContent = fs.readFileSync(CONFIG_FILE, "utf-8");
    fs.unlinkSync(CONFIG_FILE);
  }
});

afterEach(() => {
  if (backupExists) {
    fs.writeFileSync(CONFIG_FILE, backupContent, "utf-8");
  } else if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
});

describe("config", () => {
  it("returns empty object when no config file exists", () => {
    const config = loadConfig();
    assert.deepStrictEqual(config, {});
  });

  it("saves and loads config", () => {
    saveConfig({ registry_url: "https://example.com/index.json" });
    const config = loadConfig();
    assert.equal(config.registry_url, "https://example.com/index.json");
  });

  it("getConfigValue returns saved value", () => {
    saveConfig({ registry_url: "https://custom.com/index.json" });
    assert.equal(
      getConfigValue("registry_url"),
      "https://custom.com/index.json"
    );
  });

  it("getConfigValue returns default for unset keys", () => {
    const value = getConfigValue("registry_url");
    assert.ok(value.includes("docs.kruxos.com"));
  });

  it("getConfigValue returns default for install_dir", () => {
    const value = getConfigValue("install_dir");
    assert.equal(value, "/data/kruxos/packs");
  });
});
