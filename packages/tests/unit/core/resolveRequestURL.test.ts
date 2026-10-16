import assert from "node:assert";
import { describe, it, vi } from "vitest";
import faxios, { FaxiosError } from "#src/index.ts";
import type { FaxiosRequestConfig } from "#src/index.ts";

// Untyped callers can pass any baseURL, so the config is widened the way they pass it.
const untyped = (config: Record<string, unknown>) => config as FaxiosRequestConfig;

const isBadBaseURL = (err: unknown): boolean =>
  err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes("baseURL");

describe("core::resolveRequestURL non-string baseURL", () => {
  for (const baseURL of [ 1, {}, [ "https://api.example.com" ], new URL("https://api.example.com") ]) {
    it(`getUri throws ERR_BAD_OPTION_VALUE for baseURL ${Object.prototype.toString.call(baseURL)}`, () => {
      assert.throws(() => faxios.getUri(untyped({ baseURL, url: "/x" })), isBadBaseURL);
    });

    it(`request rejects with ERR_BAD_OPTION_VALUE for baseURL ${Object.prototype.toString.call(baseURL)} without fetching`, async () => {
      const fetch = vi.fn(async () => new Response("ok"));
      const api = faxios.create({ env: { fetch } });
      await assert.rejects(api.request(untyped({ baseURL, url: "/x" })), isBadBaseURL);
      assert.strictEqual(fetch.mock.calls.length, 0);
    });
  }

  it("treats a falsy non-string baseURL (0) as no baseURL", async () => {
    assert.strictEqual(faxios.getUri(untyped({ baseURL: 0, url: "https://example.test/x" })), "https://example.test/x");
    const fetch = vi.fn(async (_input: unknown) => new Response("ok"));
    const api = faxios.create({ env: { fetch } });
    const res = await api.request(untyped({ baseURL: 0, url: "https://example.test/x" }));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(fetch.mock.calls.length, 1);
    const input = fetch.mock.calls[0]?.[0];
    assert.strictEqual(input instanceof Request ? input.url : String(input), "https://example.test/x");
  });
});
