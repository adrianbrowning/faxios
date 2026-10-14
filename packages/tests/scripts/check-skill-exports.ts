// The configure-requests skill tells agents that every import must match a row of its
// "Import boundaries" table, so a published subpath missing from the table reads as unsupported.
// This checks the table against the `exports` map in packages/lib/package.json, both ways: every
// subpath has a row, and every row names a subpath that exists. A cell can shorten a sibling
// subpath to `/name` after a full one (`@gcmdev/faxios/plugins/auth-bearer`, `/retry`), and a
// trailing `/*` covers every subpath under it. `./package.json` is metadata, not an import.
// Part of `lint:ts` in packages/tests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const libDir = resolve(import.meta.dirname, "../../lib");
const skillPath = "packages/lib/skills/configure-requests/SKILL.md";
const { exports, name } = JSON.parse(readFileSync(resolve(libDir, "package.json"), "utf8")) as { exports: Record<string, unknown>; name: string; };
const skill = readFileSync(resolve(libDir, "skills/configure-requests/SKILL.md"), "utf8");
const problems: Array<string> = [];

const section = /^## Import boundaries\n([\s\S]*?)(?=^## )/m.exec(skill)?.[1];
if (section === undefined) problems.push(`${skillPath} has no "## Import boundaries" section`);

// The specifiers in each table row's first cell.
const rows: Array<string> = [];
for (const line of (section ?? "").split("\n")) {
  const cell = /^\|([^|]*)\|/.exec(line)?.[1];
  if (cell === undefined || cell.trim() === "Import" || /^\s*-+\s*$/.test(cell)) continue;
  let parent: string | undefined;
  for (const [ , token ] of cell.matchAll(/`([^`]+)`/g)) {
    if (token!.startsWith(name)) {
      rows.push(token!);
      parent = token!.slice(0, token!.lastIndexOf("/"));
    }
    else if (token!.startsWith("/") && parent !== undefined) rows.push(parent + token);
    else problems.push(`${skillPath}: import table entry \`${token}\` is not a ${name} specifier`);
  }
}

const covers = (row: string, specifier: string): boolean =>
  (row.endsWith("/*") ? specifier.startsWith(row.slice(0, -1)) : row === specifier);

const specifiers = Object.keys(exports)
  .filter(key => key !== "./package.json")
  .map(key => (key === "." ? name : name + key.slice(1)));
for (const specifier of specifiers) {
  if (!rows.some(row => covers(row, specifier))) problems.push(`${skillPath}: the import table has no row for ${specifier}`);
}
for (const row of rows) {
  if (!specifiers.some(specifier => covers(row, specifier))) problems.push(`${skillPath}: import table row ${row} is not in the package.json exports`);
}

if (problems.length > 0) {
  console.error(`Skill import table check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
