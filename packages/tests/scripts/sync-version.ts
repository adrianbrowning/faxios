// Sets `VERSION` in packages/lib/src/lib/env/data.ts to the version in packages/lib/package.json.
// bumpy bumps package.json on the Version Packages PR; .github/workflows/bumpy-release.yml runs
// this right after, so the exported `VERSION` (and the User-Agent built from it) matches the
// release. unit/version.test.ts fails if the two ever disagree.
// Usage: node packages/tests/scripts/sync-version.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const libDir = resolve(import.meta.dirname, "../../lib");
const { version } = JSON.parse(readFileSync(resolve(libDir, "package.json"), "utf8")) as { version: string; };
const dataFile = resolve(libDir, "src/lib/env/data.ts");
const source = readFileSync(dataFile, "utf8");
const pattern = /^export const VERSION = "[^"]*";$/m;

if (!pattern.test(source)) {
  console.error(`${dataFile}: no \`export const VERSION = "…";\` line to update`);
  process.exit(1);
}

const updated = source.replace(pattern, `export const VERSION = "${version}";`);
if (updated === source) {
  console.log(`VERSION is already ${version}`);
}
else {
  writeFileSync(dataFile, updated);
  console.log(`VERSION -> ${version}`);
}
