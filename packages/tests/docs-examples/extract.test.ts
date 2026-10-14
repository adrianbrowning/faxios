import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsSources, extractBlocks, parseMarkers } from "./extract.ts";

describe("docsSources", () => {
  it("includes the READMEs, the migration guide and the package's agent skills", () => {
    const repoRoot = join(import.meta.dirname, "../../..");
    const sources = docsSources().map(path => relative(repoRoot, path));

    expect(sources).toContain("README.md");
    expect(sources).toContain("MIGRATION_GUIDE.md");
    expect(sources).toContain("packages/lib/README.md");
    expect(sources).toContain("packages/lib/skills/configure-requests/SKILL.md");
    expect(sources).toContain("packages/docs/pages/advanced/cancellation.md");
  });
});

describe("parseMarkers", () => {
  it("defaults a block with no markers to run with status 200 and no expectations", () => {
    expect(parseMarkers("page.md:1", {})).toEqual({ expect: [], literalPlaceholders: false, run: true, skip: false, status: 200 });
  });

  it("parses a comma-separated expect= list and URI-decodes each text", () => {
    const { expect: expectations } = parseMarkers("page.md:1", {
      expect: "log:Request%20canceled,error:a%2Cb,request:accept:%20text/csv%0A",
    });

    expect(expectations).toEqual([
      { kind: "log", text: "Request canceled" },
      { kind: "error", text: "a,b" },
      { kind: "request", text: "accept: text/csv\n" },
    ]);
  });

  it("keeps the colons after the first one in the expected text", () => {
    expect(parseMarkers("page.md:1", { expect: "log:https://a.test/x" }).expect).toEqual([{ kind: "log", text: "https://a.test/x" }]);
  });

  it("rejects a malformed expect= entry", () => {
    expect(() => parseMarkers("page.md:1", { expect: "reject:ERR_CANCELED" })).toThrow("page.md:1: expect=reject:ERR_CANCELED is not <error|log|request>:<text>");
    expect(() => parseMarkers("page.md:1", { expect: "log" })).toThrow("expect=log is not");
    expect(() => parseMarkers("page.md:1", { expect: "log:" })).toThrow("expect=log: is not");
    expect(() => parseMarkers("page.md:1", { expect: "log:%E0%A4%A" })).toThrow("expect=log:%E0%A4%A is not");
    expect(() => parseMarkers("page.md:1", { expect: "log:a," })).toThrow("expect= is not");
  });

  it("rejects expect= on a block that doesn't run", () => {
    expect(() => parseMarkers("page.md:1", { check: "types", expect: "log:x" })).toThrow("page.md:1: expect= needs a block that runs, not check=types");
    expect(() => parseMarkers("page.md:1", { check: "skip", reason: "fragment", expect: "log:x" })).toThrow("not check=skip");
  });

  it("needs a known reason= on check=skip, and only there", () => {
    expect(parseMarkers("page.md:1", { check: "skip", reason: "signature" })).toMatchObject({ run: false, skip: true });
    expect(() => parseMarkers("page.md:1", { check: "skip" })).toThrow("page.md:1: check=skip needs reason=<dependency|fragment|listing|signature>, got none");
    expect(() => parseMarkers("page.md:1", { check: "skip", reason: "lazy" })).toThrow("got reason=lazy");
    expect(() => parseMarkers("page.md:1", { reason: "fragment" })).toThrow("page.md:1: reason=fragment only goes with check=skip");
  });

  it("rejects an unknown marker key", () => {
    expect(() => parseMarkers("page.md:1", { expects: "log:x" })).toThrow("page.md:1: unknown marker expects (expected check, contract, expect, placeholders, reason, status)");
  });
});

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
      "```ts check=skip reason=fragment",
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

  it("carries expect= in the manifest", () => {
    const blocks = extract("```js expect=log:Request%20canceled\nconsole.log(\"Request canceled\");\n```\n");

    const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
    expect(manifest).toEqual(blocks);
    expect(manifest[0].expect).toEqual([{ kind: "log", text: "Request canceled" }]);
  });

  it("rejects unknown markers instead of silently running the block", () => {
    expect(() => extract("```ts check=typo\nconst a = 1;\n```\n")).toThrow(/unknown check=typo/);
    expect(() => extract("```ts status=abc\nconst a = 1;\n```\n")).toThrow(/not an HTTP status code/);
    expect(() => extract("```ts placeholders=typo\nconst a = 1;\n```\n")).toThrow(/unknown placeholders=typo/);
    expect(() => extract("```ts expect=typo\nconst a = 1;\n```\n")).toThrow(/expect=typo is not/);
  });

  it("checks the markers of a check=skip block too, naming its fence line", () => {
    expect(() => extract("# Page\n\n```ts check=skip\n{ url: ... }\n```\n")).toThrow(/page\.md:3: check=skip needs reason=/);
  });

  it("writes a contract block as declaration checks that never run", () => {
    const [ block ] = extract("```ts contract=@gcmdev/faxios\nisCancel(value: unknown): value is CanceledError;\n```\n");

    expect(block!.run).toBe(false);
    expect(readFileSync(join(outDir, block!.file), "utf8")).toContain("__same<__Documented[\"isCancel\"], typeof __Target.isCancel>(\"matches\");");
  });

  it("rejects a contract marker that names no entry point or export, or isn't on a plain ts block", () => {
    expect(() => extract("```ts contract=@gcmdev/nope\nx(): void;\n```\n")).toThrow(/must name an entry point/);
    expect(() => extract("```ts contract=@gcmdev/faxios#Nope\nx(): void;\n```\n")).toThrow(/has no export named Nope/);
    expect(() => extract("```js contract=@gcmdev/faxios\nx(): void;\n```\n")).toThrow(/needs a ts block/);
    expect(() => extract("```ts contract=@gcmdev/faxios check=types\nx(): void;\n```\n")).toThrow(/needs a ts block/);
  });
});
