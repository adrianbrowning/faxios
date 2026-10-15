// Extracts the js/ts code blocks from the repository and package READMEs, the migration guide,
// the package's agent skills and the English docs pages into one module per block, so they can
// be type-checked and run.
//
// Fence info-string markers (key=value, no spaces in a value; mdcode drops bare words). Every
// marker is parsed by `parseMarkers` below, and an unknown key or value fails the extraction:
//   check=skip    not extracted. Needs reason=<why>:
//                   signature   an API signature or declaration listing, not code
//                   listing     an object shape shown as a listing (e.g. the response schema)
//                   fragment    a partial snippet that can't stand alone (a bare `catch`, server code)
//                   dependency  imports a package the docs harness doesn't install
//   check=types   type-checked but not run: browser-only code, real servers
//   status=404    the fake fetch answers this block's requests with that status
//   placeholders=literal  the block requests a literal `/:x` or `{x}` path on purpose,
//                 so the fake fetch doesn't reject it as an unsubstituted placeholder
//   expect=<kind>:<text>[,<kind>:<text>...]  the documented outcome; each one must hold once
//                 the block's requests and their handling have finished. <text> is URI-decoded,
//                 so write a space as %20 and a comma as %2C:
//                   log:<text>      a console.log/info/warn/debug call printed <text>
//                   error:<text>    a console.error call printed <text> (any other block fails
//                                   on its first console.error)
//                   request:<text>  a request contained <text>, written as `METHOD url`, then
//                                   one `name: value` line per header, a blank line and the body
// Any other js/ts block is type-checked and run.
//
// Usage: node docs-examples/extract.ts [--only <path substring>] [--out <dir name>]
// `--out` writes to a sibling directory (with its own tsconfig.json), so runs don't clobber each other.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse } from "mdcode-ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
export const defaultOutDir = join(here, ".generated");

const EXTENSIONS: Record<string, "js" | "ts"> = {
  js: "js",
  javascript: "js",
  mjs: "js",
  ts: "ts",
  typescript: "ts",
};

const EXPECTATION_KINDS = [ "error", "log", "request" ] as const;
export type Expectation = { kind: typeof EXPECTATION_KINDS[number]; text: string; };

const MARKER_KEYS: Record<string, true> = { check: true, expect: true, placeholders: true, reason: true, status: true };
const SKIP_REASONS = [ "dependency", "fragment", "listing", "signature" ];

export type ExtractedBlock = {
  // The documented outcomes from expect=, checked after the block's requests finish.
  expect: Array<Expectation>;
  file: string;
  // The block requests literal `/:x` or `{x}` paths, so the placeholder guard is skipped.
  literalPlaceholders: boolean;
  run: boolean;
  // `path:line` of the opening fence, relative to the repo root.
  source: string;
  status: number;
};

type Markers = Omit<ExtractedBlock, "file" | "source"> & { skip: boolean; };

function markdownFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [ path ] : [];
  });
}

// The repository landing README, the npm README, the migration guide, the agent skills shipped
// in the package and the docs pages. The docs are English-only.
export function docsSources(): Array<string> {
  return [
    join(repoRoot, "README.md"),
    join(repoRoot, "MIGRATION_GUIDE.md"),
    join(repoRoot, "packages/lib/README.md"),
    ...markdownFiles(join(repoRoot, "packages/lib/skills")),
    ...markdownFiles(join(repoRoot, "packages/docs/pages")),
  ].sort();
}

function fenceLine(markdown: string, codeStart: number): number {
  // `position.start` is the offset of the first code character; the fence is the line before it.
  let line = 1;
  for (let i = 0; i < codeStart; i++) {
    if (markdown.charCodeAt(i) === 10) line++;
  }
  return line - 1;
}

function parseExpectation(source: string, entry: string): Expectation {
  const colon = entry.indexOf(":");
  const kind = EXPECTATION_KINDS.find(name => name === entry.slice(0, colon));
  let text = "";
  try {
    text = decodeURIComponent(entry.slice(colon + 1));
  }
  catch {
    // A bad %-escape leaves `text` empty and falls through to the error below.
  }
  if (colon < 0 || !kind || text === "") {
    throw new Error(`${source}: expect=${entry} is not <${EXPECTATION_KINDS.join("|")}>:<text>`);
  }
  return { kind, text };
}

// The one parser for fence markers. Throws on an unknown key or value, so a typo can't silently
// run (or skip checks on) a block.
export function parseMarkers(source: string, meta: Record<string, string>): Markers {
  const { check, expect, placeholders, reason, status = "200" } = meta;
  const unknown = Object.keys(meta).filter(key => !Object.hasOwn(MARKER_KEYS, key));
  if (unknown.length > 0) {
    throw new Error(`${source}: unknown marker ${unknown.join(", ")} (expected ${Object.keys(MARKER_KEYS).join(", ")})`);
  }
  if (check !== undefined && check !== "skip" && check !== "types") {
    throw new Error(`${source}: unknown check=${check} (expected "skip" or "types")`);
  }
  if (check === "skip" && !SKIP_REASONS.includes(reason ?? "")) {
    throw new Error(`${source}: check=skip needs reason=<${SKIP_REASONS.join("|")}>, got ${reason === undefined ? "none" : `reason=${reason}`}`);
  }
  if (check !== "skip" && reason !== undefined) {
    throw new Error(`${source}: reason=${reason} only goes with check=skip`);
  }
  if (!/^[1-5]\d\d$/.test(status)) {
    throw new Error(`${source}: status=${status} is not an HTTP status code`);
  }
  if (placeholders !== undefined && placeholders !== "literal") {
    throw new Error(`${source}: unknown placeholders=${placeholders} (expected "literal")`);
  }
  const expectations = expect === undefined ? [] : expect.split(",").map(entry => parseExpectation(source, entry));
  if (expectations.length > 0 && check !== undefined) {
    throw new Error(`${source}: expect= needs a block that runs, not check=${check}`);
  }
  return {
    expect: expectations,
    literalPlaceholders: placeholders === "literal",
    run: check === undefined,
    skip: check === "skip",
    status: Number(status),
  };
}

export function extractBlocks(paths: Array<string>, outDir: string): Array<ExtractedBlock> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const blocks: Array<ExtractedBlock> = [];
  for (const path of paths) {
    const markdown = readFileSync(path, "utf8");
    const label = relative(repoRoot, path);
    for (const block of parse({ source: markdown })) {
      const ext = EXTENSIONS[block.lang];
      if (!ext) continue;

      const line = fenceLine(markdown, block.position?.start ?? 0);
      const source = `${label}:${line}`;
      const { skip, ...markers } = parseMarkers(source, block.meta);
      if (skip) continue;

      const file = `${label.replaceAll("/", "__")}__L${line}.${ext}`;
      // `export {}` keeps every block a module, so top-level await works and names don't clash.
      writeFileSync(join(outDir, file), `// ${source}\n${block.code}\nexport {};\n`);
      blocks.push({ source, file, ...markers });
    }
  }

  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(blocks, null, 2));
  return blocks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { only: { type: "string" }, out: { type: "string" } } });
  const paths = docsSources().filter(path => !values.only || path.includes(values.only));
  const outDir = values.out ? join(here, values.out) : defaultOutDir;
  const blocks = extractBlocks(paths, outDir);
  if (values.out) {
    writeFileSync(join(outDir, "tsconfig.json"), JSON.stringify({ extends: "../tsconfig.json", include: [ "./*.ts", "./*.js" ] }));
  }
  const runnable = blocks.filter(block => block.run).length;
  console.log(`Extracted ${blocks.length} blocks (${runnable} runnable) from ${paths.length} files to ${relative(process.cwd(), outDir)}`);
}
