import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { format } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultOutDir } from "./extract.ts";
import type { Expectation, ExtractedBlock } from "./extract.ts";

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
// Every fetch the current block started, settled or not, so the test can wait for all of them.
let inFlight: Array<Promise<unknown>> = [];
// The requests the current block sent, as `METHOD url`, `name: value` header lines, a blank line and the body.
let sentRequests: Array<string> = [];
// The current block's console calls, formatted the way the console would print them.
let consoleCalls: Array<{ method: string; text: string; }> = [];

// faxios substitutes only `{key}` path params. A `/:id` segment or a leftover `{id}` means the
// example sent its template as the literal path. `new Request()` percent-encodes braces, so decode first.
function placeholderIn(url: string): boolean {
  const pathname = decodeURI(new URL(url).pathname);
  return /\/:[a-z]/i.test(pathname) || /\{[^/{}]+\}/.test(pathname);
}

class PageRequest extends Request {
  constructor(input: Request | string | URL, init?: RequestInit) {
    super(typeof input === "string" ? new URL(input, PAGE_URL) : input, init);
  }
}

// Every request gets a JSON `{}` body with the block's status (200 unless it sets status=).
async function respond(input: Request | string | URL, init?: RequestInit): Promise<Response> {
  // Build and read the request as a real fetch would, so bad URLs and bodies still throw.
  const request = new PageRequest(input, init);
  if (checkPlaceholders && placeholderIn(request.url)) {
    placeholderUrls.push(request.url);
    throw new Error(`docs example requested ${request.url} with an unsubstituted path placeholder (use {key} with pathParams, or mark the block placeholders=literal)`);
  }
  // Like a real fetch, an aborted signal rejects with its reason, before and while the body is read.
  request.signal.throwIfAborted();
  const body = await request.text();
  request.signal.throwIfAborted();
  const headers = [ ...request.headers ].map(([ name, value ]) => `${name}: ${value}\n`).join("");
  sentRequests.push(`${request.method} ${request.url}\n${headers}\n${body}`);
  return new Response("{}", { status, headers: { "Content-Type": "application/json" } });
}

const fakeFetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
  const response = respond(input, init);
  inFlight.push(response.catch(() => {}));
  return response;
};

// Waits until every request the block started has settled and the code handling its response
// (faxios's and the example's own `.then`/`.catch`) has run, including requests that code starts.
async function settleRequests(): Promise<void> {
  do {
    await Promise.all(inFlight.splice(0));
    // Promise handlers run before the next macrotask, so this lets the response handling finish.
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  } while (inFlight.length > 0);
}

// Returns a message for each documented outcome that didn't happen, and for each console.error
// the block didn't document.
function unmetOutcomes(expectations: Array<Expectation>): Array<string> {
  const errors = consoleCalls.filter(call => call.method === "error").map(call => call.text);
  const logs = consoleCalls.filter(call => call.method !== "error").map(call => call.text);
  const seen = { error: errors, log: logs, request: sentRequests };
  const unmet = expectations
    .filter(({ kind, text }) => !seen[kind].some(entry => entry.includes(text)))
    .map(({ kind, text }) => `expect=${kind}:${JSON.stringify(text)} did not hold`);
  if (!expectations.some(({ kind }) => kind === "error")) {
    unmet.push(...errors.map(text => `console.error: ${text}`));
  }
  return unmet;
}

describe("docs examples", () => {
  beforeAll(() => {
    vi.stubGlobal("Request", PageRequest);
    vi.stubGlobal("fetch", fakeFetch);
    // Muted, but recorded: expect= checks what a block printed, and console.error fails it.
    for (const method of [ "debug", "error", "info", "log", "warn" ] as const) {
      vi.spyOn(console, method).mockImplementation((...args: Array<unknown>) => {
        consoleCalls.push({ method, text: format(...args) });
      });
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
      inFlight = [];
      sentRequests = [];
      consoleCalls = [];
      try {
        // Runs the block: each one is a generated module named in the manifest.
        await import(pathToFileURL(join(outDir, block.file)).href);
      }
      finally {
        await settleRequests();
      }
      if (placeholderUrls.length > 0) {
        throw new Error(`requested unsubstituted path placeholder URL(s): ${placeholderUrls.join(", ")}`);
      }
      expect(unmetOutcomes(block.expect)).toEqual([]);
    });
  }
});
