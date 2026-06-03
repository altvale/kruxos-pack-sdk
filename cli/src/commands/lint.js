import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const lintCommand = new Command("lint")
  .description("Check capability definitions against documentation standard")
  .option("-d, --dir <directory>", "Pack directory", ".")
  .option("--fix", "Attempt to fix common issues")
  .action((opts) => {
    try {
      const issues = lintPack(opts);
      const errors = issues.filter((i) => i.severity === "error");
      const warnings = issues.filter((i) => i.severity === "warning");

      console.log(
        `\n  ${errors.length} error(s), ${warnings.length} warning(s)\n`
      );

      if (errors.length > 0) {
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export function lintPack(opts = {}) {
  const packDir = path.resolve(opts.dir || ".");
  const issues = [];

  const manifestPath = path.join(packDir, "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `No manifest.yaml found in "${packDir}". Run this from a pack directory or use --dir.`
    );
  }

  const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));

  console.log(`\n  KruxOS Pack Lint`);
  console.log(`  ─────────────────`);
  console.log(`  Pack: ${manifest.name}\n`);

  issues.push(...lintManifest(manifest));
  issues.push(...lintDefinitions(packDir, manifest));
  issues.push(...lintPolicies(manifest));

  return issues;
}

function error(file, message) {
  console.log(`  ERROR  ${file}: ${message}`);
  return { severity: "error", file, message };
}

function warn(file, message) {
  console.log(`  WARN   ${file}: ${message}`);
  return { severity: "warning", file, message };
}

function ok(file, message) {
  console.log(`  OK     ${file}: ${message}`);
  return { severity: "ok", file, message };
}

function lintManifest(manifest) {
  const issues = [];

  if (!manifest.description || manifest.description.length < 10) {
    issues.push(
      error("manifest.yaml", "Description must be at least 10 characters")
    );
  } else if (manifest.description.length < 30) {
    issues.push(
      warn("manifest.yaml", "Description should be at least 30 characters for discoverability")
    );
  } else {
    issues.push(ok("manifest.yaml", "Description is descriptive"));
  }

  if (!manifest.author) {
    issues.push(warn("manifest.yaml", "Author field is empty"));
  }

  if (manifest.security) {
    if (
      manifest.security.network_egress &&
      manifest.security.network_egress.length > 0
    ) {
      for (const endpoint of manifest.security.network_egress) {
        if (!endpoint.includes(":")) {
          issues.push(
            error(
              "manifest.yaml",
              `Network egress "${endpoint}" must include port (e.g., "host:443")`
            )
          );
        } else {
          issues.push(
            ok("manifest.yaml", `Network egress "${endpoint}" format valid`)
          );
        }
      }
    }
  }

  return issues;
}

function lintDefinitions(packDir, manifest) {
  const issues = [];

  if (!manifest.capabilities || !Array.isArray(manifest.capabilities)) {
    issues.push(error("manifest.yaml", "No capabilities listed"));
    return issues;
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
    if (!fs.existsSync(fullPath)) {
      issues.push(error(capPath, "File does not exist"));
      continue;
    }

    let definitions;
    try {
      definitions = yaml.load(fs.readFileSync(fullPath, "utf-8"));
    } catch (e) {
      issues.push(error(capPath, `Invalid YAML: ${e.message}`));
      continue;
    }

    if (!Array.isArray(definitions)) {
      issues.push(error(capPath, "Must be a YAML array of capability definitions"));
      continue;
    }

    for (const def of definitions) {
      const name = def.name || "(unnamed)";

      // Check all 7 required sections
      for (const section of requiredSections) {
        if (def[section] === undefined || def[section] === null) {
          issues.push(error(capPath, `${name}: missing required section "${section}"`));
        }
      }

      // Check that purpose doesn't use vague language
      if (def.purpose) {
        const vagueTerms = [
          "does stuff",
          "handles things",
          "manages stuff",
          "TODO",
          "FIXME",
          "placeholder",
        ];
        for (const term of vagueTerms) {
          if (def.purpose.toLowerCase().includes(term.toLowerCase())) {
            issues.push(
              warn(capPath, `${name}: purpose contains vague term "${term}"`)
            );
          }
        }
      }

      // Check that when_to_use gives actual guidance
      if (def.when_to_use && typeof def.when_to_use === "string") {
        if (def.when_to_use.trim().length < 20) {
          issues.push(
            error(
              capPath,
              `${name}: when_to_use is too short (${def.when_to_use.trim().length} chars, need >= 20)`
            )
          );
        }

        // Should mention when NOT to use (best practice, just a warning)
        if (
          !def.when_to_use.toLowerCase().includes("instead") &&
          !def.when_to_use.toLowerCase().includes("not")
        ) {
          issues.push(
            warn(
              capPath,
              `${name}: when_to_use should mention alternatives or when NOT to use`
            )
          );
        }
      }

      // Inputs validation
      if (def.inputs && Array.isArray(def.inputs)) {
        for (const input of def.inputs) {
          if (!input.description || input.description.length < 5) {
            issues.push(
              error(
                capPath,
                `${name}: input "${input.name}" needs a longer description`
              )
            );
          }

          if (input.required === undefined) {
            issues.push(
              warn(
                capPath,
                `${name}: input "${input.name}" should specify required: true/false`
              )
            );
          }
        }
      }

      // Outputs validation
      if (def.outputs && Array.isArray(def.outputs)) {
        for (const output of def.outputs) {
          if (!output.description || output.description.length < 5) {
            issues.push(
              error(
                capPath,
                `${name}: output "${output.name}" needs a longer description`
              )
            );
          }
        }
      }

      // Errors must have recovery suggestions
      if (def.errors && Array.isArray(def.errors)) {
        for (const err of def.errors) {
          if (!err.recovery || !Array.isArray(err.recovery) || err.recovery.length === 0) {
            issues.push(
              warn(
                capPath,
                `${name}: error "${err.type}" has no recovery suggestions`
              )
            );
          }
        }
      }

      // Common patterns must have steps
      if (def.common_patterns && Array.isArray(def.common_patterns)) {
        if (def.common_patterns.length === 0) {
          issues.push(
            error(capPath, `${name}: common_patterns is empty — add at least one pattern`)
          );
        }
        for (const pattern of def.common_patterns) {
          if (!pattern.steps || !Array.isArray(pattern.steps) || pattern.steps.length === 0) {
            issues.push(
              error(
                capPath,
                `${name}: pattern "${pattern.description || "?"}" must have steps`
              )
            );
          }
        }
      }

      // Permission tier check
      const validTiers = [
        "autonomous",
        "notify",
        "approval_required",
        "blocked",
      ];
      if (def.permission_tier && !validTiers.includes(def.permission_tier)) {
        issues.push(
          error(
            capPath,
            `${name}: permission_tier "${def.permission_tier}" is invalid (use: ${validTiers.join(", ")})`
          )
        );
      }

      // Side effects with no reversible flag
      if (def.side_effects && Array.isArray(def.side_effects)) {
        for (const effect of def.side_effects) {
          if (effect.reversible === undefined) {
            issues.push(
              warn(
                capPath,
                `${name}: side_effect "${effect.description || "?"}" should specify reversible: true/false`
              )
            );
          }
        }
      }
    }
  }

  return issues;
}

function lintPolicies(manifest) {
  const issues = [];

  if (!manifest.default_policies) {
    issues.push(warn("manifest.yaml", "No default_policies defined"));
    return issues;
  }

  const validTiers = ["autonomous", "notify", "approval_required", "blocked"];

  for (const [capName, tier] of Object.entries(manifest.default_policies)) {
    if (!validTiers.includes(tier)) {
      issues.push(
        error(
          "manifest.yaml",
          `default_policies: "${capName}" has invalid tier "${tier}"`
        )
      );
    } else {
      issues.push(
        ok("manifest.yaml", `default_policies: "${capName}" → ${tier}`)
      );
    }
  }

  // Warn about sensitive tiers
  if (
    manifest.security &&
    manifest.security.network_egress &&
    manifest.security.network_egress.length > 0
  ) {
    for (const [capName, tier] of Object.entries(manifest.default_policies)) {
      if (tier === "autonomous") {
        issues.push(
          warn(
            "manifest.yaml",
            `"${capName}" is autonomous but pack has network egress — consider approval_required`
          )
        );
      }
    }
  }

  return issues;
}
