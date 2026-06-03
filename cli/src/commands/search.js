import { Command } from "commander";
import { fetchIndex, getDefaultRegistryUrl } from "../registry-client.js";

export const searchCommand = new Command("search")
  .description("Search the community pack registry")
  .argument("<query>", "Search query (matches name and description)")
  .option(
    "--registry-url <url>",
    "Registry index URL",
    getDefaultRegistryUrl()
  )
  .option("--no-cache", "Skip cache and fetch fresh index")
  .action(async (query, opts) => {
    try {
      const results = await searchRegistry(query, opts);
      if (results.length === 0) {
        console.log(`\n  No packs found matching "${query}".\n`);
      } else {
        console.log(`\n  Found ${results.length} pack(s) matching "${query}":\n`);
        for (const pack of results) {
          console.log(`  ${pack.name} (v${pack.version})`);
          console.log(`    ${pack.description}`);
          if (pack.author) console.log(`    Author: ${pack.author}`);
          if (pack.security_review_required) console.log(`    [Requires security review]`);
          console.log("");
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export async function searchRegistry(query, opts = {}) {
  const registryUrl = opts.registryUrl || getDefaultRegistryUrl();
  const useCache = opts.cache !== false;

  const index = await fetchIndex(registryUrl, useCache);
  return filterIndex(index, query);
}

function filterIndex(index, query) {
  // Registry index is a wrapped envelope: {registry_version, updated_at, packs[]}.
  // See docs/internal/pack-registry.md for the schema.
  let packs;
  if (index && typeof index === "object" && Array.isArray(index.packs)) {
    packs = index.packs;
  } else {
    return [];
  }

  const terms = query.toLowerCase().split(/\s+/);

  return packs.filter((pack) => {
    const searchable = [
      pack.name || "",
      pack.description || "",
      ...(pack.capabilities || []),
      ...(pack.tags || []),
    ]
      .join(" ")
      .toLowerCase();

    return terms.every((term) => searchable.includes(term));
  });
}

// Exported for testing: search a local index directly
export function searchLocalIndex(index, query) {
  return filterIndex(index, query);
}
