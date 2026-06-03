import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { searchLocalIndex } from "../src/commands/search.js";

// Wrapped envelope: {registry_version, updated_at, packs[]}
const sampleIndex = {
  registry_version: "1",
  updated_at: "2026-05-26T00:00:00Z",
  packs: [
    {
      name: "postgres-pack",
      version: "1.2.0",
      description: "PostgreSQL database management capabilities for KruxOS",
      author: "KruxOS Team",
      capabilities: ["postgres.query", "postgres.migrate"],
      tags: ["database", "sql"],
    },
    {
      name: "slack-pack",
      version: "1.0.0",
      description: "Slack messaging integration for KruxOS agents",
      author: "Community Contributor",
      capabilities: ["slack.send_message", "slack.read_channel"],
      tags: ["messaging", "chat"],
    },
    {
      name: "csv-tools",
      version: "0.9.0",
      description: "CSV file parsing and transformation capabilities",
      author: "Data Tools",
      capabilities: ["csv.parse", "csv.transform", "csv.export"],
      tags: ["data", "csv"],
    },
  ],
};

describe("searchLocalIndex", () => {
  it("finds packs by name", () => {
    const results = searchLocalIndex(sampleIndex, "postgres");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "postgres-pack");
  });

  it("finds packs by description keyword", () => {
    const results = searchLocalIndex(sampleIndex, "messaging");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "slack-pack");
  });

  it("finds packs by capability name", () => {
    const results = searchLocalIndex(sampleIndex, "csv.parse");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "csv-tools");
  });

  it("finds packs by tag", () => {
    const results = searchLocalIndex(sampleIndex, "database");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "postgres-pack");
  });

  it("returns multiple matches", () => {
    const results = searchLocalIndex(sampleIndex, "pack");
    assert.equal(results.length, 2);
    const names = results.map((r) => r.name);
    assert.ok(names.includes("postgres-pack"));
    assert.ok(names.includes("slack-pack"));
  });

  it("returns empty array for no matches", () => {
    const results = searchLocalIndex(sampleIndex, "nonexistent");
    assert.equal(results.length, 0);
  });

  it("is case insensitive", () => {
    const results = searchLocalIndex(sampleIndex, "PostgreSQL");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "postgres-pack");
  });

  it("supports multi-word queries (all terms must match)", () => {
    const results = searchLocalIndex(sampleIndex, "csv parsing");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "csv-tools");
  });

  it("multi-word query with no full match returns empty", () => {
    const results = searchLocalIndex(sampleIndex, "postgres messaging");
    assert.equal(results.length, 0);
  });

  it("handles empty packs array", () => {
    const empty = { registry_version: "1", updated_at: "2026-05-26T00:00:00Z", packs: [] };
    const results = searchLocalIndex(empty, "test");
    assert.equal(results.length, 0);
  });

  it("handles malformed (legacy flat-array) index gracefully", () => {
    const results = searchLocalIndex([{ name: "legacy", description: "old shape" }], "legacy");
    assert.equal(results.length, 0);
  });

  it("handles non-object index gracefully", () => {
    const results = searchLocalIndex("not-an-object", "test");
    assert.equal(results.length, 0);
  });
});
