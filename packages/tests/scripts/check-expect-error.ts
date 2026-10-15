// A `@ts-expect-error` passes as long as *some* error sits on the line below it, so after code
// moves it can end up silenced by the wrong error. Each directive therefore names the error it
// expects, `// @ts-expect-error TS2353 -- reason`, and this check confirms that code is reported on
// the directive's target line once the directive is removed.
//
// `node scripts/check-expect-error.ts` (part of `lint:ts`) compiles the workspace roots with
// tsconfig.check.json and browser with browser/tsconfig.json. module/esm and smoke/esm compile
// against the installed tarball, which doesn't exist yet when lint:ts runs, so there it only
// requires a code. Two modes check those codes after the installs:
// `--module` (run by module/esm/tests/expect-error.module.test.ts) checks the module/esm codes
// with module/esm's pinned TypeScript: each helper typings.module.test.ts and ts.module.test.ts
// compile in a temp dir under that fixture's tsconfig, every other file under
// module/esm/tsconfig.json.
// `--smoke` (run by `lint:ts:smoke` and the ESM smoke CI job) checks the smoke/esm codes under
// smoke/esm/tsconfig.json, with the TypeScript that `lint:ts:smoke` uses.
// `--write` adds the current code to directives that have none.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
// The module suite owns its fixture table and temp-dir helper; this check compiles the same
// fixtures under the same settings, so it reads them from there.
/* eslint-disable no-restricted-imports -- shared with module/esm's typings tests, see above */
import { cleanupTempFixture, createTempFixture } from "../module/esm/tests/helpers/fixture.ts";
import { suiteRoot as esmDir, tscBin as esmTscBin, functionsFixture, typingFixtures } from "../module/esm/tests/helpers/typing-fixtures.ts";
import type { TypingFixture } from "../module/esm/tests/helpers/typing-fixtures.ts";
/* eslint-enable no-restricted-imports */

const testsDir = resolve(import.meta.dirname, "..");
const esmTestsDir = join(esmDir, "tests");
const smokeEsmTestsDir = join(testsDir, "smoke/esm/tests");
const DIRECTIVE = "// @ts-expect-error";
const SUFFIX = ".expect-error-check.ts";
const write = process.argv.includes("--write");
const moduleMode = process.argv.includes("--module");
const smokeMode = process.argv.includes("--smoke");

type Directive = { code: string | undefined; index: number; };
type Source = { directives: Array<Directive>; lines: Array<string>; path: string; };
// `copy` is the file tsc compiles: the source with its directives disabled.
type Copy = { copy: string; source: Source; };

const problems: Array<string> = [];
const changed = new Set<Source>();

// Every .ts file under `dir` that carries a directive.
function scan(dir: string): Array<Source> {
  const found: Array<Source> = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    // node_modules, .generated*, and module/esm's .tmp-module-* fixture dirs
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    if (statSync(path).isDirectory()) {
      found.push(...scan(path));
      continue;
    }
    if (!path.endsWith(".ts") || path.endsWith(SUFFIX)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    const directives = lines.flatMap((line: string, index: number) =>
      (line.includes(DIRECTIVE) ? [{ index, code: /@ts-expect-error\s+(TS\d+)/.exec(line)?.[1] }] : []));
    if (directives.length > 0) found.push({ path, lines, directives });
  }
  return found;
}

const where = (source: Source, directive: Directive): string => `${relative(testsDir, source.path)}:${directive.index + 1}`;

const disabled = (source: Source): string =>
  source.lines.map((line: string) => line.replace(DIRECTIVE, "// expect-error-check")).join("\n");

// Checks one directive against the codes tsc reports on its target line.
function verify(source: Source, directive: Directive, byLine: Map<number, Array<string>>, label: string): void {
  // TypeScript applies a directive to the next line: 0-based index + 2 in 1-based numbering.
  const found = byLine.get(directive.index + 2) ?? [];
  if (found.length === 0) {
    problems.push(`${where(source, directive)}: no error on the line below this @ts-expect-error${label}`);
  }
  else if (directive.code === undefined) {
    if (write) {
      // Also turns a lone `-` before the reason into the documented `--`.
      source.lines[directive.index] = source.lines[directive.index]!.replace(/\/\/ @ts-expect-error( -(?!-))?/, (_: string, dash?: string) => `${DIRECTIVE} ${found[0]}${dash === undefined ? "" : " --"}`);
      directive.code = found[0];
      changed.add(source);
    }
    else problems.push(`${where(source, directive)}: name the expected error, e.g. "${DIRECTIVE} ${found[0]} -- reason" (the line below reports ${found.join(", ")})`);
  }
  else if (!found.includes(directive.code)) {
    problems.push(`${where(source, directive)}: expects ${directive.code}, but the line below reports ${found.join(", ")}${label}`);
  }
}

// Writes the copies, runs `tsc -p project` in `cwd`, then verifies each directive. `label` names
// the compile in problems when a source is compiled under several settings.
function check(tsc: string, project: string, cwd: string, copies: Array<Copy>, label = ""): void {
  let output = "";
  try {
    for (const { copy, source } of copies) writeFileSync(copy, disabled(source));
    execFileSync(process.execPath, [ tsc, "--noEmit", "-p", project, "--incremental", "false", "--pretty", "false" ], { cwd, encoding: "utf8", stdio: "pipe" });
  }
  catch (error) {
    // tsc exits non-zero with its diagnostics on stdout; anything else (no tsc, a failed write) is fatal.
    if (error instanceof Error && "stdout" in error && typeof error.stdout === "string") output = error.stdout;
    else throw error;
  }
  finally {
    for (const { copy } of copies) rmSync(copy, { force: true });
  }

  // copy -> 1-based line -> error codes on that line
  const codesByLine = new Map<string, Map<number, Array<string>>>(copies.map(({ copy }) => [ copy, new Map() ]));
  for (const match of output.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+)/gm)) {
    const byLine = codesByLine.get(resolve(cwd, match[1]!));
    if (byLine === undefined) {
      problems.push(`tsc reports an error outside the directive copies, fix it first${label}: ${match[0]}`);
      continue;
    }
    byLine.set(Number(match[2]), [ ...byLine.get(Number(match[2])) ?? [], match[3]! ]);
  }

  for (const { copy, source } of copies) {
    for (const directive of source.directives) verify(source, directive, codesByLine.get(copy)!, label);
  }
}

const besideSource = (source: Source): Copy => ({ source, copy: source.path.replace(/\.ts$/, SUFFIX) });

const workspaceTsc = (): string => createRequire(import.meta.url).resolve("typescript/bin/tsc");

function checkWorkspace(): void {
  const tsc = workspaceTsc();
  check(tsc, "tsconfig.check.json", testsDir, [ "unit", "setup", "eslint-rules", "docs-examples" ].flatMap(root => scan(join(testsDir, root))).map(besideSource));
  check(tsc, "browser/tsconfig.json", testsDir, scan(join(testsDir, "browser")).map(besideSource));
  // Suites that compile against the installed tarball, and the mode that checks them after the install.
  for (const [ dir, mode ] of [[ esmTestsDir, "--module" ], [ smokeEsmTestsDir, "--smoke" ]] as const) {
    for (const source of scan(dir)) {
      for (const directive of source.directives) {
        if (directive.code === undefined) problems.push(`${where(source, directive)}: name the expected error, "${DIRECTIVE} TSnnnn -- reason" (\`node scripts/check-expect-error.ts ${mode} --write\` adds it once the suite is installed)`);
      }
    }
  }
}

function checkSmoke(): void {
  check(workspaceTsc(), "smoke/esm/tsconfig.json", testsDir, scan(smokeEsmTestsDir).map(besideSource));
}

function checkModule(): void {
  const fixtures: Array<TypingFixture> = [ ...typingFixtures, functionsFixture ].filter(fixture => fixture.tsc === esmTscBin);
  const sources = scan(esmTestsDir);
  for (const fixture of fixtures) {
    const source = sources.find(({ path }) => path === fixture.source);
    if (source === undefined) continue;
    const fixturePath = createTempFixture(esmDir, `expect-error-${fixture.name}`, fixture.source, fixture.tsconfig, { type: "module" });
    try {
      check(esmTscBin, "tsconfig.json", fixturePath, [{ source, copy: join(fixturePath, "index.ts") }], ` [${fixture.title}]`);
    }
    finally {
      cleanupTempFixture(fixturePath);
    }
  }

  const rest = sources.filter(({ path }) => !fixtures.some(fixture => fixture.source === path)).map(besideSource);
  if (rest.length === 0) return;
  const project = join(esmDir, `tsconfig${SUFFIX.replace(/\.ts$/, ".json")}`);
  writeFileSync(project, JSON.stringify({ extends: "./tsconfig.json", include: rest.map(({ copy }) => relative(esmDir, copy)) }));
  try {
    check(esmTscBin, project, esmDir, rest);
  }
  finally {
    rmSync(project, { force: true });
  }
}

if (moduleMode) checkModule();
else if (smokeMode) checkSmoke();
else checkWorkspace();

for (const source of changed) writeFileSync(source.path, source.lines.join("\n"));

if (problems.length > 0) {
  console.error(`@ts-expect-error check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
