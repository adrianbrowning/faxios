// The harness lockfiles pin the integrity of faxios.tgz, which changes with
// every build. Rewrite only that digest to match the staged tarball so installs
// stay frozen and every registry package keeps its locked version and integrity.
// Usage: node pin-tarball-integrity.ts <lockfile relative to packages/tests>...
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const testsDir = new URL("./", import.meta.url);
const tarball = readFileSync(new URL("faxios.tgz", testsDir));
const digest = createHash("sha512")
  .update(tarball)
  .digest("base64");
const integrity = `sha512-${digest}`;

const ENTRY_BY_LOCKFILE: Record<string, RegExp> = {
  "pnpm-lock.yaml": /(\{integrity: )sha512-[\w+/=]+(, tarball: file:\.\.\/\.\.\/faxios\.tgz\})/g,
  "bun.lock": /("@gcmdev\/faxios@\.\.\/\.\.\/faxios\.tgz", \{\}, ")sha512-[\w+/=]+(")/g,
};

for (const lockfile of process.argv.slice(2)) {
  const entry = ENTRY_BY_LOCKFILE[basename(lockfile)];
  if (!entry) {
    throw new Error(`${lockfile}: unsupported lockfile`);
  }
  const url = new URL(lockfile, testsDir);
  const lock = readFileSync(url, "utf8");
  const matches = lock.match(entry)?.length ?? 0;
  if (matches !== 1) {
    throw new Error(`${lockfile}: expected one faxios.tgz integrity entry, found ${matches}`);
  }
  writeFileSync(url, lock.replace(entry, `$1${integrity}$2`));
  console.log(`${lockfile}: faxios.tgz integrity -> ${integrity}`);
}
