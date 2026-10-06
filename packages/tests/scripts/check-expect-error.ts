// A `@ts-expect-error` passes as long as *some* error sits on the line below it, so after code
// moves it can end up silenced by the wrong error. Each directive therefore names the error it
// expects, `// @ts-expect-error TS2353 -- reason`, and this check confirms that code is reported on
// the directive's target line once the directive is removed. Part of `lint:ts`.
// `node scripts/check-expect-error.ts --write` adds the current code to directives that have none.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";

const testsDir = resolve(import.meta.dirname, "..");
const roots = [ "unit", "setup", "eslint-rules", "docs-examples" ];
const DIRECTIVE = "// @ts-expect-error";
const SUFFIX = ".expect-error-check.ts";
const write = process.argv.includes("--write");

type Directive = { index: number; code: string | undefined; };
type Copy = { source: string; copy: string; lines: Array<string>; directives: Array<Directive>; };
const copies: Array<Copy> = [];

function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".generated")) continue;
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!path.endsWith(".ts") || path.endsWith(SUFFIX)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    const directives = lines.flatMap((line: string, index: number) =>
      (line.includes(DIRECTIVE) ? [{ index, code: /@ts-expect-error\s+(TS\d+)/.exec(line)?.[1] }] : []));
    if (directives.length === 0) continue;
    const copy = path.replace(/\.ts$/, SUFFIX);
    writeFileSync(copy, lines.map((line: string) => line.replace(DIRECTIVE, "// expect-error-check")).join("\n"));
    copies.push({ source: path, copy, lines, directives });
  }
}

let output = "";
try {
  for (const root of roots) walk(join(testsDir, root));
  try {
    execFileSync(process.execPath, [ createRequire(import.meta.url).resolve("typescript/bin/tsc"), "--noEmit", "-p", "tsconfig.check.json", "--incremental", "false", "--pretty", "false" ], { cwd: testsDir, encoding: "utf8", stdio: "pipe" });
  }
  catch (error) {
    output = String((error as { stdout?: string; }).stdout ?? "");
  }
}
finally {
  for (const { copy } of copies) rmSync(copy, { force: true });
}

const problems: Array<string> = [];
// file -> 1-based line -> error codes on that line
const codesByLine = new Map<string, Map<number, Array<string>>>();
for (const match of output.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+)/gm)) {
  const file = resolve(testsDir, match[1]!);
  if (!file.endsWith(SUFFIX)) {
    problems.push(`tsc reports an error outside the directive copies, fix it first: ${match[0]}`);
    continue;
  }
  const byLine = codesByLine.get(file) ?? new Map<number, Array<string>>();
  byLine.set(Number(match[2]), [ ...byLine.get(Number(match[2])) ?? [], match[3]! ]);
  codesByLine.set(file, byLine);
}

for (const { source, copy, lines, directives } of copies) {
  let changed = false;
  for (const { index, code } of directives) {
    // TypeScript applies a directive to the next line: 0-based index + 2 in 1-based numbering.
    const found = codesByLine.get(copy)?.get(index + 2) ?? [];
    const where = `${relative(testsDir, source)}:${index + 1}`;
    if (found.length === 0) {
      problems.push(`${where}: no error on the line below this @ts-expect-error`);
    }
    else if (code === undefined) {
      if (write) {
        lines[index] = lines[index]!.replace(DIRECTIVE, `${DIRECTIVE} ${found[0]}`);
        changed = true;
      }
      else problems.push(`${where}: name the expected error, e.g. "${DIRECTIVE} ${found[0]} -- reason" (the line below reports ${found.join(", ")})`);
    }
    else if (!found.includes(code)) {
      problems.push(`${where}: expects ${code}, but the line below reports ${found.join(", ")}`);
    }
  }
  if (changed) writeFileSync(source, lines.join("\n"));
}

if (problems.length > 0) {
  console.error(`@ts-expect-error check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
