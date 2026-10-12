// Writes the version from packages/lib/package.json into the hard-coded `VERSION` in
// packages/lib/src/lib/env/data.ts. faxios sends VERSION in the User-Agent and error messages,
// and version.test.ts fails when it differs from package.json. `bumpy version` only bumps
// package.json, so release.yml runs this on the Version Packages PR after bumpy updates it.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const libDir = resolve(import.meta.dirname, "../../lib");
const dataFile = resolve(libDir, "src/lib/env/data.ts");
const { version } = JSON.parse(readFileSync(resolve(libDir, "package.json"), "utf8")) as { version: string; };

const pattern = /export const VERSION = "[^"]*";/;
const source = readFileSync(dataFile, "utf8");
if (!pattern.test(source)) {
  console.error(`sync-version: no \`export const VERSION = "...";\` line in ${dataFile}`);
  process.exit(1);
}

const updated = source.replace(pattern, `export const VERSION = ${JSON.stringify(version)};`);
if (updated === source) {
  console.log(`VERSION is already ${version}`);
}
else {
  writeFileSync(dataFile, updated);
  console.log(`VERSION set to ${version}`);
}
