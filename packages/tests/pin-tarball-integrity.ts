// The harness lockfiles pin the integrity of faxios.tgz, which changes with
// every build. Rewrite only that digest (and, in pnpm lockfiles, the tarball's
// version, which a release bumps) to match the staged tarball so installs stay
// frozen and every registry package keeps its locked version and integrity.
// The committed lockfiles can therefore carry an older faxios version.
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
// The tarball is packed from this checkout's packages/lib.
const { version } = JSON.parse(readFileSync(new URL("../lib/package.json", testsDir), "utf8")) as { version: string; };

const ENTRY_BY_LOCKFILE: Record<string, { pattern: RegExp; replacement: string; }> = {
  "pnpm-lock.yaml": {
    pattern: /(\{integrity: )sha512-[\w+/=]+(, tarball: file:\.\.\/\.\.\/faxios\.tgz\}\n {4}version: )\S+/g,
    replacement: `$1${integrity}$2${version}`,
  },
  "bun.lock": {
    pattern: /("@gcmdev\/faxios@\.\.\/\.\.\/faxios\.tgz", \{\}, ")sha512-[\w+/=]+(")/g,
    replacement: `$1${integrity}$2`,
  },
};

for (const lockfile of process.argv.slice(2)) {
  const entry = ENTRY_BY_LOCKFILE[basename(lockfile)];
  if (!entry) {
    throw new Error(`${lockfile}: unsupported lockfile`);
  }
  const url = new URL(lockfile, testsDir);
  const lock = readFileSync(url, "utf8");
  const matches = lock.match(entry.pattern)?.length ?? 0;
  if (matches !== 1) {
    throw new Error(`${lockfile}: expected one faxios.tgz entry, found ${matches}`);
  }
  writeFileSync(url, lock.replace(entry.pattern, entry.replacement));
  console.log(`${lockfile}: faxios.tgz ${version} integrity -> ${integrity}`);
}
