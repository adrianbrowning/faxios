// Writes the version from packages/lib/package.json into the hard-coded `VERSION` in
// packages/lib/src/lib/env/data.ts and the `library_version` in the packaged configure-requests
// skill. faxios sends VERSION in the User-Agent and error messages, and version.test.ts fails
// when it differs from package.json; the skill ships in the tarball and names the version it
// describes. `bumpy version` only bumps package.json, so release.yml runs this on the Version
// Packages PR after bumpy updates it.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const libDir = resolve(import.meta.dirname, "../../lib");
const { version } = JSON.parse(readFileSync(resolve(libDir, "package.json"), "utf8")) as { version: string; };

const targets = [
  {
    file: resolve(libDir, "src/lib/env/data.ts"),
    label: "VERSION",
    pattern: /export const VERSION = "[^"]*";/,
    expected: "`export const VERSION = \"...\";`",
    line: `export const VERSION = ${JSON.stringify(version)};`,
  },
  {
    file: resolve(libDir, "skills/configure-requests/SKILL.md"),
    label: "configure-requests library_version",
    pattern: /library_version: '[^']*'/,
    expected: "`library_version: '...'`",
    line: `library_version: '${version}'`,
  },
];

let failed = false;
for (const { file, label, pattern, expected, line } of targets) {
  const source = readFileSync(file, "utf8");
  if (!pattern.test(source)) {
    console.error(`sync-version: no ${expected} line in ${file}`);
    failed = true;
    continue;
  }
  const updated = source.replace(pattern, line);
  if (updated === source) {
    console.log(`${label} is already ${version}`);
  }
  else {
    writeFileSync(file, updated);
    console.log(`${label} set to ${version}`);
  }
}
if (failed) {
  process.exit(1);
}
