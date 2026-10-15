// Extracts the js/ts code blocks from every first-party Markdown file into one module per block,
// so they can be type-checked and run. The files are the `documents` of mdcode.config.json (the
// ones `mdcode update --project` keeps in sync with their sources) plus the pending bump files;
// `checkScope` fails on any other tracked Markdown file that isn't in EXCLUDED.
//
// Every block is one of:
//   - a copy of a source file (`file=`, optionally `region=`), which mdcode keeps in sync. A js/ts
//     copy is extracted with the markers below like any other block, so it still has to run.
//   - a js/ts example written in the Markdown, checked with the markers below.
//   - a block in one of the NOT_EXAMPLES languages, never checked, for the reason listed there.
// Any other block fails the extraction.
//
// Fence info-string markers (key=value, no spaces in a value; mdcode drops bare words and refuses
// malformed metadata, such as an unclosed quote or a key given twice). Every marker is read from
// mdcode's parsed metadata by `parseMarkers` below, and an unknown key or value fails the extraction:
//   file=<path> [region=<name>]  the block is a copy of that source file (or region), see above
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
//   contract=@gcmdev/faxios[#Export]  a ts block of declarations, type-checked against the
//                 shipped declarations instead of compiled as code, never run (see contract.ts)
// Any other js/ts block is type-checked and run.
//
// Usage: node docs-examples/extract.ts [--only <path substring>] [--out <dir name>]
// `--out` writes to a sibling directory (with its own tsconfig.json), so runs don't clobber each other.
import { execFileSync } from "node:child_process";
import { existsSync, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { MetadataError, parse } from "mdcode-ts";
import type { Block } from "mdcode-ts";
import { contractModule, parseContractTarget } from "./contract.ts";

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

// `file` and `region` are mdcode's own keys: mdcode resolves and syncs them, the extractor only
// lets them through.
const MARKER_KEYS: Record<string, true> = { check: true, contract: true, expect: true, file: true, placeholders: true, reason: true, region: true, status: true };
const SKIP_REASONS = [ "dependency", "fragment", "listing", "signature" ];

// Fence languages that never hold an example, and why. A block in any other language must be
// a js/ts example or a `file=` copy.
const NOT_EXAMPLES: Record<string, string> = {
  "": "plain listings: directory trees, diagrams and request flows",
  bash: "shell commands that install, build or test the workspace",
  diff: "before/after hunks of a migration, not complete code",
  html: "the markup a neighbouring js example works on",
  json: "data a page shows: payloads and the JSON a form becomes",
  text: "program output and diagrams",
};

// Tracked Markdown that is neither synced nor scanned, and why (maintainer decision on #283).
// A key ending in `/` excludes that directory; any other key excludes that one file.
const EXCLUDED: Record<string, string> = {
  "packages/lib/CHANGELOG.md": "generated: bumpy writes it from the bump files at release",
  ".agents/skills/": "agent skills installed from upstream skill packages",
  ".claude/skills/": "agent skills installed from upstream skill packages (cc-pr-review) or generated by one (do-work)",
  "_artifacts/": "Intent's skill-maintenance records (domain map, skill spec and tree)",
  ".intent/": "Intent's review state",
};

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

// The documents in mdcode.config.json, and the pending bump files: those come and go with each
// release, and a `documents` glob that matches nothing is an mdcode config error, so they are
// scanned here but not synced. Globs use Node's `fs.glob`, as mdcode does.
export function docsSources(): Array<string> {
  const { documents } = JSON.parse(readFileSync(join(repoRoot, "mdcode.config.json"), "utf8")) as { documents: Array<string>; };
  const paths = new Set([ ...documents, ".bumpy/*.md" ].flatMap(pattern => globSync(pattern, { cwd: repoRoot })));
  return [ ...paths ].map(path => join(repoRoot, path)).sort();
}

// Tracked and new (not ignored) Markdown files, relative to the repo root.
export function trackedMarkdown(): Array<string> {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- the checkout's own git lists its files
  const listed = execFileSync("git", [ "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md" ], { cwd: repoRoot, encoding: "utf8" });
  return listed.split("\0").filter(path => path !== "" && existsSync(join(repoRoot, path)));
}

// Throws on a Markdown file (relative to the repo root) that is neither scanned nor excluded, so a
// new page can't bypass the checks.
export function checkScope(markdown: Array<string>, scanned: Array<string>): void {
  const known = new Set(scanned);
  const outside = markdown.filter(path => !known.has(path)
    && !Object.keys(EXCLUDED).some(rule => (rule.endsWith("/") ? path.startsWith(rule) : path === rule)));
  if (outside.length > 0) {
    throw new Error(`Markdown outside the docs examples scope: ${outside.join(", ")}. Add it to "documents" in mdcode.config.json, or to EXCLUDED in docs-examples/extract.ts with a reason`);
  }
}

// mdcode refuses a document with malformed fence metadata; name the document in its error.
function parseDocument(label: string, markdown: string): Array<Block> {
  try {
    return parse({ source: markdown });
  }
  catch (error) {
    if (error instanceof MetadataError) throw new Error(`${label}: ${error.message}`, { cause: error });
    throw error;
  }
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

// A contract block is only type-checked against the shipped declarations. Checked before a skip,
// so `check=skip` can't hide a contract that is never checked.
function validateContract(source: string, ext: "js" | "ts", { check, contract, expect, status }: Record<string, string>): void {
  if (contract !== undefined && (ext !== "ts" || check !== undefined || status !== undefined || expect !== undefined)) {
    throw new Error(`${source}: contract= needs a ts block without check=, status= or expect=`);
  }
}

// A block in a language that is neither js/ts nor in NOT_EXAMPLES must be a `file=` copy, so a new
// kind of block is classified instead of slipping past the checks.
function validateLanguage(source: string, { lang, meta }: Block): void {
  if (meta.file === undefined && !Object.hasOwn(NOT_EXAMPLES, lang)) {
    throw new Error(`${source}: unclassified ${lang} block; copy it from a source file with file=, or list the language in NOT_EXAMPLES in docs-examples/extract.ts with a reason`);
  }
}

export function extractBlocks(paths: Array<string>, outDir: string): Array<ExtractedBlock> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const blocks: Array<ExtractedBlock> = [];
  for (const path of paths) {
    const markdown = readFileSync(path, "utf8");
    const label = relative(repoRoot, path);
    const pageHelpers = new Map<string, string>();
    for (const block of parseDocument(label, markdown)) {
      const ext = EXTENSIONS[block.lang];
      const line = block.position?.line ?? 0;
      const source = `${label}:${line}`;
      if (!ext) {
        validateLanguage(source, block);
        continue;
      }

      const { skip, ...markers } = parseMarkers(source, block.meta);
      validateContract(source, ext, block.meta);
      if (skip) continue;
      const { contract } = block.meta;

      const file = `${label.replaceAll("/", "__")}__L${line}.${ext}`;
      // `export {}` keeps every block a module, so top-level await works and names don't clash.
      const code = contract === undefined ? block.code : contractModule(source, block.code, parseContractTarget(source, contract), pageHelpers);
      writeFileSync(join(outDir, file), `// ${source}\n${code}\nexport {};\n`);
      blocks.push({ source, file, ...markers, run: markers.run && contract === undefined });
    }
  }

  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(blocks, null, 2));
  return blocks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { only: { type: "string" }, out: { type: "string" } } });
  const sources = docsSources();
  checkScope(trackedMarkdown(), sources.map(path => relative(repoRoot, path)));
  const paths = sources.filter(path => !values.only || path.includes(values.only));
  const outDir = values.out ? join(here, values.out) : defaultOutDir;
  const blocks = extractBlocks(paths, outDir);
  if (values.out) {
    writeFileSync(join(outDir, "tsconfig.json"), JSON.stringify({ extends: "../tsconfig.json", include: [ "./*.ts", "./*.js" ] }));
  }
  const runnable = blocks.filter(block => block.run).length;
  console.log(`Extracted ${blocks.length} blocks (${runnable} runnable) from ${paths.length} files to ${relative(process.cwd(), outDir)}`);
}
