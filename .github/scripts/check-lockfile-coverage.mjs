// Fails when a tracked lockfile is not kept up to date by Dependabot and audited in CI.
// Every lockfile an install reads must have a Dependabot entry for its directory (in
// .github/dependabot.yml), or a MANUAL entry below with the reason Dependabot can't update it,
// and a `--audit-level=high` audit step (in the workflow below) when its tool has an audit.
// A lockfile that nothing installs from should be deleted, not listed here.
// Usage: node .github/scripts/check-lockfile-coverage.mjs (from anywhere in the repo)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const DEPENDABOT = ".github/dependabot.yml";
const AUDIT_WORKFLOW = ".github/workflows/lockfile-lint.yml";

// Lockfile name -> Dependabot ecosystem and the audit tool that reads it (null: none).
const KINDS = {
  "pnpm-lock.yaml": { ecosystem: "npm", tool: "pnpm" },
  "package-lock.json": { ecosystem: "npm", tool: "npm" },
  "yarn.lock": { ecosystem: "npm", tool: "yarn" },
  "bun.lock": { ecosystem: "bun", tool: "bun" },
  "bun.lockb": { ecosystem: "bun", tool: "bun" },
  "deno.lock": { ecosystem: null, tool: null },
};

// Lockfiles Dependabot can't update, so they must have no Dependabot entry. Each needs a reason a
// maintainer accepted, saying why and how the lockfile is kept current instead.
const TARBALL_HARNESS =
  "Its package.json depends on file:../../faxios.tgz, which is never committed, so Dependabot's update jobs can't install it. " +
  "The harness-audit job in lockfile-lint.yml runs pnpm audit on it; update it by hand with the tarball staged (AGENTS.md).";
const MANUAL = {
  "packages/tests/smoke/deno/deno.lock":
    "Dependabot has no Deno ecosystem; update it by hand (AGENTS.md). Its install is frozen.",
  "packages/tests/smoke/esm/pnpm-lock.yaml": TARBALL_HARNESS,
  "packages/tests/module/esm/pnpm-lock.yaml": TARBALL_HARNESS,
};

const read = (path) => readFileSync(join(root, path), "utf8");

const lockfiles = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((path) => Object.hasOwn(KINDS, basename(path)));

// Minimal reader for the `updates:` list: `package-ecosystem`, then `directory` or a `directories` list.
function dependabotEntries(text) {
  const entries = [];
  let current = null;
  let inDirectories = false;
  for (const line of text.split("\n")) {
    const ecosystem = line.match(/^\s*- package-ecosystem:\s*['"]?([\w-]+)['"]?/);
    if (ecosystem) {
      current = { ecosystem: ecosystem[1], directories: [] };
      entries.push(current);
      inDirectories = false;
      continue;
    }
    if (!current) continue;
    const directory = line.match(/^\s*directory:\s*['"]?([^'"\s]+)['"]?/);
    if (directory) {
      current.directories.push(directory[1]);
      continue;
    }
    if (/^\s*directories:\s*$/.test(line)) {
      inDirectories = true;
      continue;
    }
    const item = inDirectories && line.match(/^\s*- ['"]?([^'"\s]+)['"]?\s*$/);
    if (item) {
      current.directories.push(item[1]);
      continue;
    }
    inDirectories = false;
  }
  return entries;
}

// Dependabot directories are repo-absolute and may use `*` for one path segment.
function directoryMatches(pattern, dir) {
  const want = pattern.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const have = dir === "." ? [] : dir.split("/");
  return want.length === have.length && want.every((segment, i) => segment === "*" || segment === have[i]);
}

// Each `<tool> ... audit ... --audit-level=high` run line audits the lockfile in `--dir`/`--prefix`/`--cwd`,
// else in its step's `working-directory`, else at the repo root.
function auditedLockfiles(text) {
  const lines = text.split("\n");
  const isStepStart = (line) => /^\s*- (?:name|uses|run|id|if|working-directory):/.test(line);
  const audited = new Set();
  lines.forEach((line, i) => {
    const command = line.match(/\b(pnpm|npm|yarn|bun|deno)\b.*\baudit\b.*--audit-level[= ]high/);
    if (!command) return;
    let start = i;
    while (start > 0 && !isStepStart(lines[start])) start--;
    let end = i + 1;
    while (end < lines.length && !isStepStart(lines[end])) end++;
    const dir = line.match(/--(?:dir|prefix|cwd)[= ](\S+)/)?.[1]
      ?? lines.slice(start, end).map((l) => l.match(/^\s*(?:- )?working-directory:\s*['"]?([^'"\s]+)/)?.[1]).find(Boolean)
      ?? ".";
    audited.add(`${dir.replace(/^\.\/|\/$/g, "") || "."}:${command[1]}`);
  });
  return audited;
}

const entries = dependabotEntries(read(DEPENDABOT));
const audited = auditedLockfiles(read(AUDIT_WORKFLOW));
const problems = [];

for (const lockfile of lockfiles) {
  const { ecosystem, tool } = KINDS[basename(lockfile)];
  const dir = dirname(lockfile);
  const dependabotDir = `/${dir === "." ? "" : dir}`;
  const updated = entries.some(
    (entry) => entry.ecosystem === ecosystem && entry.directories.some((pattern) => directoryMatches(pattern, dir)),
  );
  if (Object.hasOwn(MANUAL, lockfile)) {
    const reason = MANUAL[lockfile];
    if (typeof reason !== "string" || reason.trim() === "") {
      problems.push(`${lockfile}: its MANUAL entry needs the reason Dependabot can't update it and how it is kept current`);
    }
    if (updated) {
      problems.push(`${lockfile}: listed in MANUAL, but ${DEPENDABOT} still runs '${ecosystem}' update jobs for ${dependabotDir}; remove one`);
    }
  }
  else if (!updated) {
    problems.push(`${lockfile}: no '${ecosystem ?? "?"}' Dependabot entry for ${dependabotDir} in ${DEPENDABOT}`);
  }
  if (tool !== null && !audited.has(`${dir}:${tool}`)) {
    problems.push(`${lockfile}: no '${tool} audit --audit-level=high' step for ${dir} in ${AUDIT_WORKFLOW}`);
  }
}
for (const lockfile of Object.keys(MANUAL)) {
  if (!lockfiles.includes(lockfile)) problems.push(`${lockfile}: listed in MANUAL but not tracked; remove the entry`);
}

if (problems.length > 0) {
  console.error("Lockfiles without update and audit coverage:");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("Cover each lockfile an install reads, or delete it if nothing installs from it.");
  process.exit(1);
}
console.log(`All ${lockfiles.length} lockfiles are audited where their tool can, and covered by Dependabot or a MANUAL reason.`);
