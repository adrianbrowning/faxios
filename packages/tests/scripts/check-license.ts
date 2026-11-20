// The published tarball must contain LICENSE: the MIT terms require the notice in every copy.
// npm adds LICENSE only from the package directory, so packages/lib/LICENSE is a committed copy of
// the root file. This checks that the copy matches the root and that `npm pack` includes it.
// It packs with npm, not pnpm, because pnpm adds the workspace root LICENSE to a package that has
// none, which hides a missing file from every pnpm-packed tarball, including the one run-ci.yml
// packs for release.yml to publish. npm's file list is the stricter check. Part of `lint:ts` in packages/tests;
// release.yml checks the packed tarball holds LICENSE again before it publishes.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const libDir = resolve(import.meta.dirname, "../../lib");
const rootLicense = resolve(import.meta.dirname, "../../../LICENSE");
const libLicense = resolve(libDir, "LICENSE");
const problems: Array<string> = [];

if (!existsSync(libLicense)) {
  problems.push("packages/lib/LICENSE is missing; copy the root LICENSE there");
}
else if (readFileSync(libLicense, "utf8") !== readFileSync(rootLicense, "utf8")) {
  problems.push("packages/lib/LICENSE differs from the root LICENSE; copy the root file over it");
}

// Use the `npm` on PATH: its file list adds no root LICENSE, so a LICENSE missing from
// packages/lib shows up here even though run-ci.yml's pnpm-packed tarball would hide it.
// eslint-disable-next-line sonarjs/no-os-command-from-path -- the PATH npm is the one under test
const packed = JSON.parse(execFileSync("npm", [ "pack", "--dry-run", "--json", "--ignore-scripts" ], {
  cwd: libDir,
  encoding: "utf8",
  stdio: [ "ignore", "pipe", "ignore" ],
})) as Array<{ files: Array<{ path: string; }>; }>;
if (!packed[0]!.files.some(file => file.path === "LICENSE")) {
  problems.push("`npm pack` in packages/lib does not include LICENSE; check the package.json files list");
}

if (problems.length > 0) {
  console.error(`LICENSE check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
