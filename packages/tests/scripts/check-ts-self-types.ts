// Deno finds the types of a built `.js` module only through a `@ts-self-types` pragma, so every
// module packages/lib/src/index.ts re-exports types from needs one, on line 1. The compiler
// keeps the pragma only if it isn't attached to a statement it erases: a type-only import or
// export right below it takes the pragma with it, so leave a blank line before one.
// Part of `lint:ts` in packages/tests.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const srcDir = resolve(import.meta.dirname, "../../lib/src");
const indexPath = join(srcDir, "index.ts");
const problems: Array<string> = [];

function check(file: string, required: boolean): void {
  const lines = readFileSync(file, "utf8").split("\n");
  const at = lines.findIndex((line: string) => line.startsWith("// @ts-self-types="));
  const name = relative(srcDir, file);
  const expected = `// @ts-self-types="./${basename(file, ".ts")}.d.ts"`;
  if (at === -1) {
    if (required) problems.push(`${name}: src/index.ts re-exports types from it, so line 1 must start with ${expected}`);
    return;
  }
  if (at !== 0) problems.push(`${name}:${at + 1}: the @ts-self-types pragma must be line 1`);
  if (!lines[at]!.startsWith(expected)) problems.push(`${name}:${at + 1}: expected ${expected}`);
  if (/^(?:import|export)\s+type\b/.test(lines[at + 1] ?? "")) {
    problems.push(`${name}:${at + 2}: put a blank line after the @ts-self-types pragma; the compiler drops it along with this type-only statement`);
  }
}

// Modules index.ts re-exports types from: `export type { … } from "./x.ts"`, including multi-line lists.
const index = readFileSync(indexPath, "utf8");
const typeSources = new Set<string>();
for (const match of index.matchAll(/export\s+type\s*\{[^}]*\}\s*from\s*"(\.[^"]+)"/g)) {
  typeSources.add(resolve(dirname(indexPath), match[1]!));
}
for (const file of typeSources) {
  if (existsSync(file)) check(file, true);
  else problems.push(`index.ts: re-exports types from missing ${relative(srcDir, file)}`);
}

// Every other pragma in src must have the same shape.
function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".ts") && !typeSources.has(path)) check(path, false);
  }
}
walk(srcDir);

if (problems.length > 0) {
  console.error(`@ts-self-types check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
