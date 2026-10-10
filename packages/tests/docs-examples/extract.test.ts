import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractBlocks } from "./extract.ts";

describe("extractBlocks", () => {
  let dir: string;
  let markdown: string;
  let outDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-examples-"));
    markdown = join(dir, "page.md");
    outDir = join(dir, "out");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function extract(source: string) {
    writeFileSync(markdown, source);
    return extractBlocks([ markdown ], outDir);
  }

  it("extracts js/ts blocks, applies markers, and reports the fence line", () => {
    const blocks = extract([
      "# Page", // 1
      "", // 2
      "```ts", // 3
      "const a: number = 1;",
      "```",
      "",
      "```js check=types", // 7
      "document.title = \"x\";",
      "```",
      "",
      "```ts check=skip",
      "{ url: ... }",
      "```",
      "",
      "```bash",
      "npm install",
      "```",
      "",
      "```typescript status=404", // 19
      "await fetch(\"/x\");",
      "```",
    ].join("\n"));

    expect(blocks.map(({ source, run, status }) => ({ line: source.split(":").at(-1), run, status }))).toEqual([
      { line: "3", run: true, status: 200 },
      { line: "7", run: false, status: 200 },
      { line: "19", run: true, status: 404 },
    ]);
    expect(blocks.map(block => block.file.split(".").at(-1))).toEqual([ "ts", "js", "ts" ]);
    expect(readFileSync(join(outDir, blocks[0]!.file), "utf8")).toContain("const a: number = 1;\nexport {};");
  });

  it("carries placeholders=literal in the manifest and defaults it off", () => {
    const blocks = extract("```ts placeholders=literal\nawait fetch(\"/a/:b\");\n```\n\n```ts\nconst a = 1;\n```\n");

    expect(blocks.map(block => block.literalPlaceholders)).toEqual([ true, false ]);
    const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
    expect(manifest.map((block: { literalPlaceholders: boolean; }) => block.literalPlaceholders)).toEqual([ true, false ]);
  });

  it("rejects unknown markers instead of silently running the block", () => {
    expect(() => extract("```ts check=typo\nconst a = 1;\n```\n")).toThrow(/unknown check=typo/);
    expect(() => extract("```ts status=abc\nconst a = 1;\n```\n")).toThrow(/not an HTTP status code/);
    expect(() => extract("```ts placeholders=typo\nconst a = 1;\n```\n")).toThrow(/unknown placeholders=typo/);
  });
});
