// Extracts the js/ts code blocks from the package README and the English docs
// pages into one module per block, so they can be type-checked and run.
//
// Fence info-string markers (key=value; mdcode drops bare words):
//   check=skip    not extracted: fragments, pseudo-code, config listings
//   check=types   type-checked but not run: browser-only code, real servers
//   status=404    the fake fetch answers this block's requests with that status
//   placeholders=literal  the block requests a literal `/:x` or `{x}` path on purpose,
//                 so the fake fetch doesn't reject it as an unsubstituted placeholder
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

export type ExtractedBlock = {
  // `path:line` of the opening fence, relative to the repo root.
  source: string;
  file: string;
  run: boolean;
  status: number;
  // The block requests literal `/:x` or `{x}` paths, so the placeholder guard is skipped.
  literalPlaceholders: boolean;
};

function markdownFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [ path ] : [];
  });
}

// The npm README plus the English docs pages. The es/fr/zh translations live
// outside packages/docs/pages and are not part of the site yet.
export function docsSources(): Array<string> {
  return [
    join(repoRoot, "packages/lib/README.md"),
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

// Throws on an unknown marker value, so a typo can't silently run (or skip checks on) a block.
function validateMarkers(source: string, { check, status, placeholders }: Record<string, string | undefined>): void {
  if (check !== undefined && check !== "types") {
    throw new Error(`${source}: unknown check=${check} (expected "skip" or "types")`);
  }
  if (status !== undefined && !/^[1-5]\d\d$/.test(status)) {
    throw new Error(`${source}: status=${status} is not an HTTP status code`);
  }
  if (placeholders !== undefined && placeholders !== "literal") {
    throw new Error(`${source}: unknown placeholders=${placeholders} (expected "literal")`);
  }
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
      const { check, status = "200", placeholders } = block.meta;
      if (!ext || check === "skip") continue;

      const line = fenceLine(markdown, block.position?.start ?? 0);
      const source = `${label}:${line}`;
      validateMarkers(source, block.meta);

      const file = `${label.replaceAll("/", "__")}__L${line}.${ext}`;
      // `export {}` keeps every block a module, so top-level await works and names don't clash.
      writeFileSync(join(outDir, file), `// ${source}\n${block.code}\nexport {};\n`);
      blocks.push({
        source,
        file,
        run: check !== "types",
        status: Number(status),
        literalPlaceholders: placeholders === "literal",
      });
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
