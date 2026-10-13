// Deno finds the types of a built `.js` module only through a `@ts-self-types` pragma, so every
// module whose types a consumer reaches needs one, on line 1: each `zshy.exports` source in
// packages/lib/package.json, each module packages/lib/src/index.ts re-exports from, and each
// module packages/lib/src/lib/faxios.ts types a static member with (`typeof X`). The compiler
// keeps the pragma only if it isn't attached to a statement it erases: a type-only import or
// export right below it takes the pragma with it, so leave a blank line before one.
// Part of `lint:ts` in packages/tests.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const libDir = resolve(import.meta.dirname, "../../lib");
const srcDir = join(libDir, "src");
const indexPath = join(srcDir, "index.ts");
const faxiosPath = join(srcDir, "lib/faxios.ts");
const problems: Array<string> = [];

function check(file: string, reason: string | undefined): void {
  const lines = readFileSync(file, "utf8").split("\n");
  const at = lines.findIndex((line: string) => line.startsWith("// @ts-self-types="));
  const name = relative(srcDir, file);
  const expected = `// @ts-self-types="./${basename(file, ".ts")}.d.ts"`;
  if (at === -1) {
    if (reason !== undefined) problems.push(`${name}: ${reason}, so line 1 must start with ${expected}`);
    return;
  }
  if (at !== 0) problems.push(`${name}:${at + 1}: the @ts-self-types pragma must be line 1`);
  if (!lines[at]!.startsWith(expected)) problems.push(`${name}:${at + 1}: expected ${expected}`);
  if (/^(?:import|export)\s+type\b/.test(lines[at + 1] ?? "")) {
    problems.push(`${name}:${at + 2}: put a blank line after the @ts-self-types pragma; the compiler drops it along with this type-only statement`);
  }
}

// Source module -> why it needs the pragma (the first reason found).
const required = new Map<string, string>();
function requirePragma(from: string, specifier: string, reason: string): void {
  const file = resolve(dirname(from), specifier.replace(/\.js$/, ".ts"));
  if (!existsSync(file)) problems.push(`${relative(libDir, from)}: ${reason} missing ${specifier}`);
  else if (!required.has(file)) required.set(file, reason);
}

// Published entry points: `zshy.exports` in package.json, `unsafe/*` included.
const libPackagePath = join(libDir, "package.json");
const { zshy } = JSON.parse(readFileSync(libPackagePath, "utf8")) as { zshy: { exports: Record<string, string>; }; };
for (const [ key, source ] of Object.entries(zshy.exports)) {
  if (source.endsWith(".ts")) requirePragma(libPackagePath, source, `package.json exports "${key}" from it`);
}

// Every `export … from "./x.ts"` in index.ts, values and types, including multi-line lists.
const index = readFileSync(indexPath, "utf8");
for (const match of index.matchAll(/export\s+(?:type\s*)?\{[^}]*\}\s*from\s*"(\.[^"]+)"/g)) {
  requirePragma(indexPath, match[1]!, "src/index.ts re-exports from it");
}

// Modules faxios.ts imports a value from and uses as `typeof X` in its exported types.
const faxios = readFileSync(faxiosPath, "utf8");
const typeofNames = new Set([ ...faxios.matchAll(/\btypeof\s+([A-Za-z_$][\w$]*)/g) ].map((match: RegExpMatchArray) => match[1]!));
for (const match of faxios.matchAll(/^import ([^"]*)"(\.[^"]+)"/gm)) {
  if (match[1]!.startsWith("type ")) continue;
  // Bindings only; `as`, `from` and `type` never follow `typeof` in faxios.ts.
  const name = match[1]!.replaceAll(/[{},]/g, " ").split(" ")
    .find((candidate: string) => typeofNames.has(candidate));
  if (name !== undefined) requirePragma(faxiosPath, match[2]!, `src/lib/faxios.ts types FaxiosStatic with \`typeof ${name}\` from it`);
}

for (const [ file, reason ] of required) check(file, reason);

// Every other pragma in src must have the same shape.
function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".ts") && !required.has(path)) check(path, undefined);
  }
}
walk(srcDir);

if (problems.length > 0) {
  console.error(`@ts-self-types check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
