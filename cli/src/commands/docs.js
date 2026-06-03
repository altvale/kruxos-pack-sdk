import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const docsCommand = new Command("docs")
  .description("Generate README from capability definitions")
  .option("-o, --output <file>", "Output file", "README.md")
  .option("-d, --dir <directory>", "Pack directory", ".")
  .action((opts) => {
    try {
      const result = generateDocs(opts);
      console.log(`\n  Generated ${result.output} (${result.capabilities} capability/ies documented)\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export function generateDocs(opts = {}) {
  const packDir = path.resolve(opts.dir || ".");
  const outputFile = opts.output || "README.md";

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

  const definitions = loadAllDefinitions(packDir, manifest);
  const readme = renderReadme(manifest, definitions);

  const outputPath = path.join(packDir, outputFile);
  fs.writeFileSync(outputPath, readme, "utf-8");

  return { output: outputFile, capabilities: definitions.length, content: readme };
}

function loadAllDefinitions(packDir, manifest) {
  const definitions = [];

  if (!manifest.capabilities || !Array.isArray(manifest.capabilities)) {
    return definitions;
  }

  for (const capPath of manifest.capabilities) {
    const fullPath = path.join(packDir, capPath);
    if (!fs.existsSync(fullPath)) continue;

    let defs;
    try {
      defs = yaml.load(fs.readFileSync(fullPath, "utf-8"));
    } catch {
      continue;
    }

    if (Array.isArray(defs)) {
      definitions.push(...defs);
    }
  }

  return definitions;
}

function renderReadme(manifest, definitions) {
  const lines = [];

  // Title and description
  lines.push(`# ${manifest.name}`);
  lines.push("");
  if (manifest.description) {
    lines.push(manifest.description);
    lines.push("");
  }

  // Metadata table
  lines.push("## Pack Info");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Version | ${manifest.version || "—"} |`);
  lines.push(`| Author | ${manifest.author || "—"} |`);
  lines.push(`| Pack Type | ${manifest.pack_type || "—"} |`);
  lines.push(`| KruxOS Version | ${manifest.kruxos_version || "—"} |`);
  lines.push("");

  // Capabilities
  if (definitions.length > 0) {
    lines.push("## Capabilities");
    lines.push("");

    for (const def of definitions) {
      lines.push(`### \`${def.name}\``);
      lines.push("");

      if (def.purpose) {
        lines.push(def.purpose.trim());
        lines.push("");
      }

      if (def.when_to_use) {
        lines.push("**When to use:**");
        lines.push(def.when_to_use.trim());
        lines.push("");
      }

      if (def.permission_tier) {
        lines.push(`**Permission tier:** \`${def.permission_tier}\``);
        lines.push("");
      }

      // Inputs
      if (def.inputs && Array.isArray(def.inputs) && def.inputs.length > 0) {
        lines.push("#### Inputs");
        lines.push("");
        lines.push("| Name | Type | Required | Description |");
        lines.push("|------|------|----------|-------------|");
        for (const input of def.inputs) {
          const req = input.required ? "Yes" : "No";
          const desc = input.description || "—";
          lines.push(`| \`${input.name}\` | ${input.type} | ${req} | ${desc} |`);
        }
        lines.push("");
      }

      // Outputs
      if (def.outputs && Array.isArray(def.outputs) && def.outputs.length > 0) {
        lines.push("#### Outputs");
        lines.push("");
        lines.push("| Name | Type | Description |");
        lines.push("|------|------|-------------|");
        for (const output of def.outputs) {
          const desc = output.description || "—";
          lines.push(`| \`${output.name}\` | ${output.type} | ${desc} |`);
        }
        lines.push("");
      }

      // Common patterns (usage examples)
      if (def.common_patterns && Array.isArray(def.common_patterns) && def.common_patterns.length > 0) {
        lines.push("#### Usage Examples");
        lines.push("");
        for (const pattern of def.common_patterns) {
          if (pattern.description) {
            lines.push(`**${pattern.description}:**`);
          }
          if (pattern.steps && Array.isArray(pattern.steps)) {
            lines.push("```");
            for (const step of pattern.steps) {
              lines.push(step);
            }
            lines.push("```");
          }
          lines.push("");
        }
      }

      // Errors
      if (def.errors && Array.isArray(def.errors) && def.errors.length > 0) {
        lines.push("#### Errors");
        lines.push("");
        lines.push("| Type | Description | Recovery |");
        lines.push("|------|-------------|----------|");
        for (const err of def.errors) {
          const recovery = err.recovery && Array.isArray(err.recovery)
            ? err.recovery.map((r) => r.description || r.action).join("; ")
            : "—";
          lines.push(`| \`${err.type}\` | ${err.description || "—"} | ${recovery} |`);
        }
        lines.push("");
      }

      // Side effects
      if (def.side_effects && Array.isArray(def.side_effects) && def.side_effects.length > 0) {
        lines.push("#### Side Effects");
        lines.push("");
        for (const effect of def.side_effects) {
          const reversible = effect.reversible ? " (reversible)" : " (irreversible)";
          lines.push(`- ${effect.description || "Unknown effect"}${reversible}`);
        }
        lines.push("");
      }
    }
  }

  // Security declarations
  if (manifest.security) {
    lines.push("## Security");
    lines.push("");
    if (manifest.security.network_egress && manifest.security.network_egress.length > 0) {
      lines.push("**Network egress:**");
      for (const endpoint of manifest.security.network_egress) {
        lines.push(`- \`${endpoint}\``);
      }
      lines.push("");
    } else {
      lines.push("**Network egress:** None");
      lines.push("");
    }
    lines.push(`**Filesystem access:** ${manifest.security.filesystem || "workspace_only"}`);
    lines.push("");
  }

  // Dependencies
  if (manifest.dependencies && manifest.dependencies.length > 0) {
    lines.push("## Dependencies");
    lines.push("");
    for (const dep of manifest.dependencies) {
      lines.push(`- \`${dep}\``);
    }
    lines.push("");
  }

  // Secrets required
  if (manifest.secrets_required && manifest.secrets_required.length > 0) {
    lines.push("## Secrets Required");
    lines.push("");
    lines.push("| Type | Description |");
    lines.push("|------|-------------|");
    for (const secret of manifest.secrets_required) {
      lines.push(`| \`${secret.type}\` | ${secret.description || "—"} |`);
    }
    lines.push("");
  }

  // Default policies
  if (manifest.default_policies) {
    lines.push("## Default Policies");
    lines.push("");
    lines.push("| Capability | Tier |");
    lines.push("|------------|------|");
    for (const [cap, tier] of Object.entries(manifest.default_policies)) {
      lines.push(`| \`${cap}\` | \`${tier}\` |`);
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push(`*Generated by [KruxOS Pack SDK](https://github.com/kruxos/kruxos)*`);
  lines.push("");

  return lines.join("\n");
}
