// Bundles real consumer entry points of the built package (packages/lib/dist, through the
// workspace link) with esbuild and reports their minified and gzip sizes. zshy doesn't bundle,
// so dist/index.js alone is a short list of re-exports; only a bundle shows what a consumer ships.
// The Bundle Size workflow runs this after `build`; it appends the table to $GITHUB_STEP_SUMMARY
// when that is set and prints it otherwise. It exits 1 when an entry exceeds its budget.
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

export type Entry = {
  /** Bytes the minified bundle may reach; no budget when absent. */
  budget?: number;
  name: string;
  source: string;
};

export type Measurement = Entry & {
  gzip: number;
  /** Modules with code in the bundle, relative to packages/lib (for example `dist/lib/adapters/fetch.js`). */
  inputs: Array<string>;
  minified: number;
};

export const entries: Array<Entry> = [
  // Budgets sit a little above the measured size, so growth is a deliberate budget change.
  { name: "default", source: "import faxios from \"@gcmdev/faxios\";\nconsole.log(faxios);", budget: 59 * 1024 },
  // A named root import must not keep the default instance and the request pipeline (#297).
  { name: "isCancel", source: "import { isCancel } from \"@gcmdev/faxios\";\nconsole.log(isCancel);", budget: 1024 },
  { name: "retry", source: "import { retry } from \"@gcmdev/faxios/plugins/retry\";\nconsole.log(retry);", budget: 17 * 1024 },
  { name: "authBearer", source: "import { authBearer } from \"@gcmdev/faxios/plugins/auth-bearer\";\nconsole.log(authBearer);", budget: 20 * 1024 },
  { name: "authenticate", source: "import { authenticate } from \"@gcmdev/faxios/plugins/authenticate\";\nconsole.log(authenticate);", budget: 21 * 1024 },
  { name: "forwardTo", source: "import { forwardTo } from \"@gcmdev/faxios/plugins/forward-to\";\nconsole.log(forwardTo);", budget: 12.5 * 1024 },
  { name: "timing", source: "import { timing } from \"@gcmdev/faxios/plugins/timing\";\nconsole.log(timing);", budget: 18.5 * 1024 },
  { name: "definePlugin", source: "import { definePlugin } from \"@gcmdev/faxios/plugins\";\nconsole.log(definePlugin);", budget: 1024 },
];

const testsDir = resolve(import.meta.dirname, "..");
const libDir = resolve(testsDir, "../lib");

export async function measure(entry: Entry): Promise<Measurement> {
  const result = await build({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    metafile: true,
    minify: true,
    platform: "browser",
    stdin: { contents: entry.source, loader: "js", resolveDir: testsDir, sourcefile: `${entry.name}.js` },
    write: false,
  });
  const code = result.outputFiles[0]!.contents;
  // esbuild lists every module it parsed in the metafile, tree-shaken or not; count only the ones
  // with bytes in the output. Paths are relative to the working directory.
  const output = Object.values(result.metafile.outputs)[0]!;
  const inputs = Object.entries(output.inputs)
    .filter(([ , { bytesInOutput }]) => bytesInOutput > 0)
    .map(([ input ]) => resolve(input))
    .filter(input => input.startsWith(`${libDir}/`))
    .map(input => input.slice(libDir.length + 1));
  return { ...entry, gzip: gzipSync(code).length, inputs, minified: code.length };
}

export function overBudget(measurement: Measurement): boolean {
  return measurement.budget !== undefined && measurement.minified > measurement.budget;
}

export function summary(measurements: Array<Measurement>): string {
  const rows = measurements.map(m => {
    let budget = "";
    if (m.budget !== undefined) budget = `${m.budget} B${overBudget(m) ? " (over)" : ""}`;
    return `| ${m.name} | \`${m.source.split("\n")[0]}\` | ${m.minified} B | ${m.gzip} B | ${budget} |`;
  });
  return [
    "## Bundle Size",
    "",
    "esbuild `--bundle --minify`, browser platform, ESM.",
    "",
    "| Entry | Import | Minified | Gzip | Budget |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

if (import.meta.main) {
  const measurements = await Promise.all(entries.map(measure));
  const report = summary(measurements);
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryFile) appendFileSync(summaryFile, report);
  console.log(report);
  const over = measurements.filter(overBudget);
  if (over.length > 0) {
    console.error(`Over budget: ${over.map(m => `${m.name} (${m.minified} B > ${m.budget} B)`).join(", ")}`);
    process.exitCode = 1;
  }
}
