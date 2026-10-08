import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import { defaultOutDir } from "./extract.ts";
import type { ExtractedBlock } from "./extract.ts";

// Run `node docs-examples/extract.ts` first; the test:docs-examples script does both.
// DOCS_EXAMPLES_DIR selects a directory written with `extract.ts --out <dir>`.
const outDir = process.env.DOCS_EXAMPLES_DIR ? join(import.meta.dirname, process.env.DOCS_EXAMPLES_DIR) : defaultOutDir;
const blocks: Array<ExtractedBlock> = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));

// Examples are written for a page served from some origin, so relative URLs such as
// `faxios.get("/user")` resolve against this base, as they would in a browser.
const PAGE_URL = "https://example.test/";
let status = 200;
let checkPlaceholders = true;
// Unsubstituted placeholder URLs the current block requested. Recorded as well as thrown,
// because an example may catch the fetch error and carry on.
let placeholderUrls: Array<string> = [];

// faxios substitutes only `{key}` path params. A `/:id` segment or a leftover `{id}` means the
// example sent its template as the literal path. `new Request()` percent-encodes braces, so decode first.
function placeholderIn(url: string): boolean {
  const pathname = decodeURI(new URL(url).pathname);
  return /\/:[a-z]/i.test(pathname) || /\{[^/{}]+\}/.test(pathname);
}

class PageRequest extends Request {
  constructor(input: string | URL | Request, init?: RequestInit) {
    super(typeof input === "string" ? new URL(input, PAGE_URL) : input, init);
  }
}

// Every request gets a JSON `{}` body with the block's status (200 unless it sets status=).
const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
  // Build and read the request as a real fetch would, so bad URLs and bodies still throw.
  const request = new PageRequest(input, init);
  if (checkPlaceholders && placeholderIn(request.url)) {
    placeholderUrls.push(request.url);
    throw new Error(`docs example requested ${request.url} with an unsubstituted path placeholder (use {key} with pathParams, or mark the block placeholders=literal)`);
  }
  await request.arrayBuffer();
  return new Response("{}", { status, headers: { "Content-Type": "application/json" } });
};

describe("docs examples", () => {
  beforeAll(() => {
    vi.stubGlobal("Request", PageRequest);
    vi.stubGlobal("fetch", fakeFetch);
  });

  beforeEach(() => {
    for (const method of [ "log", "info", "warn", "error" ] as const) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const block of blocks.filter(entry => entry.run)) {
    it(block.source, async () => {
      status = block.status;
      // A fresh module graph per block, so defaults and middleware one example sets don't leak into the next.
      vi.resetModules();
      checkPlaceholders = !block.literalPlaceholders;
      placeholderUrls = [];
      await import(pathToFileURL(join(outDir, block.file)).href);
      if (placeholderUrls.length > 0) {
        throw new Error(`requested unsubstituted path placeholder URL(s): ${placeholderUrls.join(", ")}`);
      }
    });
  }
});
