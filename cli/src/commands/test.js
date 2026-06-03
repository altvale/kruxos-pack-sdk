import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import yaml from "js-yaml";

export const testCommand = new Command("test")
  .description(
    "Run test suite: schema validation, implementation tests, docs completeness"
  )
  .option("--schema-only", "Only run schema validation")
  .option("--docs-only", "Only check documentation completeness")
  .option("--impl-only", "Only run implementation tests")
  .option("-d, --dir <directory>", "Pack directory", ".")
  .action((opts) => {
    try {
      const results = runTests(opts);
      const failed = results.filter((r) => !r.passed);
      if (failed.length > 0) {
        console.log(
          `\n  ${failed.length} check(s) failed. Fix the issues above and re-run.\n`
        );
        process.exit(1);
      }
      console.log(`\n  All checks passed.\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export function runTests(opts = {}) {
  const packDir = path.resolve(opts.dir || ".");
  const results = [];

  const manifestPath = path.join(packDir, "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `No manifest.yaml found in "${packDir}". Run this from a pack directory or use --dir.`
    );
  }

  const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));

  console.log(`\n  KruxOS Pack Test Suite`);
  console.log(`  ──────────────────────`);
  console.log(`  Pack: ${manifest.name}\n`);

  const runSchema = !opts.docsOnly && !opts.implOnly;
  const runDocs = !opts.schemaOnly && !opts.implOnly;
  const runImpl = !opts.schemaOnly && !opts.docsOnly;

  if (runSchema) {
    results.push(...validateManifest(packDir, manifest));
    results.push(...validateDefinitions(packDir, manifest));
  }

  if (runDocs) {
    results.push(...checkDocsCompleteness(packDir, manifest));
  }

  if (runImpl) {
    results.push(...runImplementationTests(packDir, manifest));
  }

  return results;
}

function pass(name, detail) {
  console.log(`  PASS  ${name}`);
  if (detail) console.log(`        ${detail}`);
  return { name, passed: true };
}

function fail(name, detail) {
  console.log(`  FAIL  ${name}`);
  if (detail) console.log(`        ${detail}`);
  return { name, passed: false, detail };
}

function validateManifest(packDir, manifest) {
  const results = [];

  const required = [
    "name",
    "version",
    "description",
    "kruxos_version",
    "capabilities",
  ];

  for (const field of required) {
    if (manifest[field] !== undefined && manifest[field] !== null) {
      results.push(pass(`manifest.${field} present`));
    } else {
      results.push(fail(`manifest.${field} present`, `Missing required field: ${field}`));
    }
  }

  if (manifest.name && !/^[a-z][a-z0-9-]*$/.test(manifest.name)) {
    results.push(
      fail(
        "manifest.name valid",
        "Pack name must be lowercase letters, numbers, and hyphens"
      )
    );
  } else if (manifest.name) {
    results.push(pass("manifest.name valid"));
  }

  if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    results.push(
      fail("manifest.version semver", "Version must be semver (X.Y.Z)")
    );
  } else if (manifest.version) {
    results.push(pass("manifest.version semver"));
  }

  if (manifest.kruxos_version && !/^>=?\d+\.\d+\.\d+$/.test(manifest.kruxos_version)) {
    results.push(
      fail(
        "manifest.kruxos_version format",
        'Must be a version constraint (e.g., ">=0.0.1")'
      )
    );
  } else if (manifest.kruxos_version) {
    results.push(pass("manifest.kruxos_version format"));
  }

  if (manifest.capabilities && Array.isArray(manifest.capabilities)) {
    for (const capPath of manifest.capabilities) {
      const fullPath = path.join(packDir, capPath);
      if (fs.existsSync(fullPath)) {
        results.push(pass(`capability file exists: ${capPath}`));
      } else {
        results.push(
          fail(`capability file exists: ${capPath}`, `File not found: ${fullPath}`)
        );
      }
    }
  }

  if (manifest.security) {
    const validFilesystem = [
      "workspace_only",
      "read_only",
      "none",
      "full",
    ];
    if (
      manifest.security.filesystem &&
      !validFilesystem.includes(manifest.security.filesystem)
    ) {
      results.push(
        fail(
          "manifest.security.filesystem valid",
          `Must be one of: ${validFilesystem.join(", ")}`
        )
      );
    } else {
      results.push(pass("manifest.security.filesystem valid"));
    }
  }

  return results;
}

function validateDefinitions(packDir, manifest) {
  const results = [];

  if (!manifest.capabilities || !Array.isArray(manifest.capabilities)) {
    results.push(fail("definitions exist", "No capabilities listed in manifest"));
    return results;
  }

  const requiredSections = [
    "purpose",
    "when_to_use",
    "inputs",
    "outputs",
    "side_effects",
    "common_patterns",
    "errors",
  ];

  for (const capPath of manifest.capabilities) {
    const fullPath = path.join(packDir, capPath);
    if (!fs.existsSync(fullPath)) continue;

    let definitions;
    try {
      definitions = yaml.load(fs.readFileSync(fullPath, "utf-8"));
    } catch (e) {
      results.push(fail(`${capPath} valid YAML`, e.message));
      continue;
    }

    if (!Array.isArray(definitions)) {
      results.push(
        fail(
          `${capPath} is array`,
          "Definition file must contain a YAML array of capabilities"
        )
      );
      continue;
    }

    results.push(pass(`${capPath} valid YAML`));

    for (const def of definitions) {
      const defName = def.name || "(unnamed)";

      if (!def.name) {
        results.push(fail(`${defName}: has name`));
        continue;
      }

      results.push(pass(`${defName}: has name`));

      for (const section of requiredSections) {
        if (def[section] !== undefined && def[section] !== null) {
          results.push(pass(`${defName}: has ${section}`));
        } else {
          results.push(
            fail(`${defName}: has ${section}`, `Missing required section`)
          );
        }
      }

      if (def.inputs && Array.isArray(def.inputs)) {
        for (const input of def.inputs) {
          if (!input.name || !input.type || !input.description) {
            results.push(
              fail(
                `${defName}: input "${input.name || "?"}" complete`,
                "Each input must have name, type, and description"
              )
            );
          } else {
            results.push(pass(`${defName}: input "${input.name}" complete`));
          }
        }
      }

      if (def.outputs && Array.isArray(def.outputs)) {
        for (const output of def.outputs) {
          if (!output.name || !output.type || !output.description) {
            results.push(
              fail(
                `${defName}: output "${output.name || "?"}" complete`,
                "Each output must have name, type, and description"
              )
            );
          } else {
            results.push(pass(`${defName}: output "${output.name}" complete`));
          }
        }
      }

      if (def.errors && Array.isArray(def.errors)) {
        for (const err of def.errors) {
          if (!err.type || !err.description) {
            results.push(
              fail(
                `${defName}: error "${err.type || "?"}" complete`,
                "Each error must have type and description"
              )
            );
          } else {
            results.push(pass(`${defName}: error "${err.type}" complete`));
          }
        }
      }

      const validTiers = [
        "autonomous",
        "notify",
        "approval_required",
        "blocked",
      ];
      if (def.permission_tier) {
        if (validTiers.includes(def.permission_tier)) {
          results.push(pass(`${defName}: permission_tier valid`));
        } else {
          results.push(
            fail(
              `${defName}: permission_tier valid`,
              `Must be one of: ${validTiers.join(", ")}`
            )
          );
        }
      }
    }
  }

  return results;
}

function checkDocsCompleteness(packDir, manifest) {
  const results = [];

  if (!manifest.capabilities || !Array.isArray(manifest.capabilities)) {
    return results;
  }

  for (const capPath of manifest.capabilities) {
    const fullPath = path.join(packDir, capPath);
    if (!fs.existsSync(fullPath)) continue;

    let definitions;
    try {
      definitions = yaml.load(fs.readFileSync(fullPath, "utf-8"));
    } catch {
      continue;
    }

    if (!Array.isArray(definitions)) continue;

    for (const def of definitions) {
      const defName = def.name || "(unnamed)";

      if (def.purpose && typeof def.purpose === "string" && def.purpose.length >= 20) {
        results.push(pass(`${defName}: purpose is descriptive`));
      } else {
        results.push(
          fail(
            `${defName}: purpose is descriptive`,
            "Purpose must be at least 20 characters"
          )
        );
      }

      if (
        def.when_to_use &&
        typeof def.when_to_use === "string" &&
        def.when_to_use.length >= 20
      ) {
        results.push(pass(`${defName}: when_to_use is descriptive`));
      } else {
        results.push(
          fail(
            `${defName}: when_to_use is descriptive`,
            "when_to_use must be at least 20 characters"
          )
        );
      }

      if (
        def.common_patterns &&
        Array.isArray(def.common_patterns) &&
        def.common_patterns.length > 0
      ) {
        for (const pattern of def.common_patterns) {
          if (
            pattern.description &&
            pattern.steps &&
            Array.isArray(pattern.steps) &&
            pattern.steps.length > 0
          ) {
            results.push(
              pass(`${defName}: pattern "${pattern.description}" complete`)
            );
          } else {
            results.push(
              fail(
                `${defName}: pattern incomplete`,
                "Each common_pattern must have description and steps array"
              )
            );
          }
        }
      }
    }
  }

  return results;
}

function runImplementationTests(packDir, manifest) {
  const results = [];
  const packType = manifest.pack_type || "python";

  const testDir = path.join(packDir, "tests");
  if (!fs.existsSync(testDir)) {
    results.push(fail("tests directory exists", "No tests/ directory found"));
    return results;
  }

  const testFiles = fs.readdirSync(testDir).filter(
    (f) => f.startsWith("test_") && f.endsWith(".py")
  );

  if (testFiles.length === 0) {
    results.push(fail("test files exist", `No test files found in tests/`));
    return results;
  }

  results.push(pass(`found ${testFiles.length} test file(s)`));

  if (packType === "python" || packType === "proxy") {
    try {
      const output = execSync("pytest tests/ -v --tb=short 2>&1", {
        cwd: packDir,
        encoding: "utf-8",
        timeout: 60000,
      });
      console.log(`\n${output}`);
      results.push(pass("pytest execution"));
    } catch (err) {
      const output = err.stdout || err.stderr || err.message;
      console.log(`\n${output}`);
      results.push(fail("pytest execution", "Tests failed — see output above"));
    }
  }

  return results;
}
