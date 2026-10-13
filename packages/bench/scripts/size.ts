// Size report: runs Size Limit over every entry in scripts/entries.ts and writes results/size.json.
// Informational only: no check has a limit, so this never fails on the numbers.
// Usage: node scripts/size.ts [--summary <file>]   (--summary appends a Markdown table, e.g. to
// $GITHUB_STEP_SUMMARY)
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CLIENT_LABELS, CLIENTS, ENTRIES, MEASURES, STAGE_LABELS, STAGES } from "./entries.ts";
import type { Measure } from "./entries.ts";
import { collectMeta } from "./meta.ts";
import { sizeResultsSchema } from "./results-schema.ts";
import type { SizeResults } from "./results-schema.ts";

const benchDir = new URL("../", import.meta.url);
const { values: args } = parseArgs({ options: { summary: { type: "string" } } });

const checks = JSON.parse(execFileSync("node_modules/.bin/size-limit", [ "--json" ], { cwd: benchDir, encoding: "utf8" })) as Array<{ name: string; size: number; }>;
const sizeOf = new Map(checks.map(check => [ check.name, check.size ]));

function sizes(name: string): Record<Measure, number> {
  return Object.fromEntries(MEASURES.map(measure => {
    const size = sizeOf.get(`${name} ${measure}`);
    if (size === undefined) throw new Error(`size-limit reported no "${name} ${measure}"`);
    return [ measure, size ];
  })) as Record<Measure, number>;
}

// Lines that are neither blank nor only a comment. Informational, never a quality score.
function sourceLines(path: string): number {
  return readFileSync(new URL(path, benchDir), "utf8").split("\n")
    .filter(line => !/^\s*(?:\/\/.*)?$/.test(line)).length;
}

const results: SizeResults = sizeResultsSchema.parse({
  meta: collectMeta(),
  bundler: { format: "esm", platform: "browser", target: "es2022" },
  dependencies: ENTRIES.filter(entry => entry.kind === "dependency")
    .map(({ name, label }) => ({ name, label, sizes: sizes(name) })),
  scenarios: ENTRIES.flatMap(({ name, label, path, client, stage }) =>
    (client ? [ { name, label, client, stage, sizes: sizes(name), sourceLines: sourceLines(path) } ] : [])),
});
writeFileSync(new URL("results/size.json", benchDir), `${JSON.stringify(results, null, 2)}\n`);
console.log("wrote results/size.json");

const kB = (bytes: number) => `${(bytes / 1000).toFixed(2)} kB`;
const table = [
  "### Fetch, Axios and faxios bundle sizes (brotli, informational)",
  "",
  `| Scenario | ${CLIENTS.map(client => CLIENT_LABELS[client]).join(" | ")} |`,
  `| --- | ${CLIENTS.map(() => "---:").join(" | ")} |`,
  ...STAGES.map(stage => `| ${STAGE_LABELS[stage]} | ${CLIENTS.map(client =>
    kB(results.scenarios.find(s => s.client === client && s.stage === stage)!.sizes.brotli)).join(" | ")} |`),
  "",
  "| Dependency only | Raw | Minified | Gzip | Brotli |",
  "| --- | ---: | ---: | ---: | ---: |",
  "| Native Fetch | 0 kB | 0 kB | 0 kB | 0 kB |",
  ...results.dependencies.map(({ label, sizes: s }) => `| ${label} | ${kB(s.raw)} | ${kB(s.minified)} | ${kB(s.gzip)} | ${kB(s.brotli)} |`),
  "",
].join("\n");
console.log(table);
if (args.summary) appendFileSync(args.summary, `${table}\n`);
