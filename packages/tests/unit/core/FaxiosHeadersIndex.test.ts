import assert from "node:assert";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import type * as SanitizeModule from "#src/lib/helpers/sanitizeHeaderValue.js";

const sanitized = vi.hoisted(() => [] as Array<unknown>);
vi.mock("#src/lib/helpers/sanitizeHeaderValue.js", async importOriginal => {
  const actual = await importOriginal<typeof SanitizeModule>();
  return {
    ...actual,
    sanitizeHeaderValue: (value: unknown) => {
      sanitized.push(value);
      return actual.sanitizeHeaderValue(value);
    },
  };
});

describe("FaxiosHeaders key index", () => {
  it("keeps the case of the first-set name", () => {
    const headers = new FaxiosHeaders({ "Content-Type": "text/plain" });
    headers.set("content-type", "application/json");

    assert.deepStrictEqual({ ...headers.toJSON() }, { "Content-Type": "application/json" });
  });

  it("finds headers written and removed as plain properties", () => {
    const headers = new FaxiosHeaders({ Accept: "text/plain" });
    headers["X-Direct"] = "1";
    delete headers["Accept"];
    headers["accept"] = "application/json";

    assert.strictEqual(headers.get("x-direct"), "1");
    assert.strictEqual(headers.has("ACCEPT"), true);
    assert.strictEqual(headers.get("Accept"), "application/json");

    headers.set("X-DIRECT", "2");
    assert.deepStrictEqual({ ...headers.toJSON() }, { "X-Direct": "2", accept: "application/json" });

    assert.strictEqual(headers.delete("x-direct"), true);
    assert.strictEqual(headers.has("X-Direct"), false);
  });

  it("finds headers after normalize renames them", () => {
    const headers = new FaxiosHeaders({ "x-foo": "1", "X-FOO": "2", "  x-bar ": "3" });
    headers.normalize(true);

    assert.deepStrictEqual({ ...headers.toJSON() }, { "X-Foo": "2", "X-Bar": "3" });
    headers.set("x-bar", "4");
    assert.strictEqual(headers.get("x-foo"), "2");
    assert.deepStrictEqual({ ...headers.toJSON() }, { "X-Foo": "2", "X-Bar": "4" });
  });

  it("builds the response headers once per response", async () => {
    let iterations = 0;
    class CountingHeaders extends Headers {
      override *[Symbol.iterator](): HeadersIterator<[string, string]> {
        iterations++;
        yield* super[Symbol.iterator]();
      }
    }

    const fetch = async () => {
      const response = new Response("{\"ok\":true}", { status: 200 });
      Object.defineProperty(response, "headers", {
        value: new CountingHeaders({ "Content-Type": "application/json", "X-Test": "1" }),
      });
      return response;
    };

    const res = await faxios.get("http://localhost/", { env: { fetch } });

    assert.strictEqual(res.headers.get("x-test"), "1");
    assert.strictEqual(iterations, 1);
  });
});

describe("FaxiosHeaders sanitizing (#296)", () => {
  const timesSanitized = (value: string) => sanitized.filter(seen => seen === value).length;

  it("sanitizes each request header value once per request", async () => {
    const fetch = async () => new Response("ok");
    const plain = faxios.create({ headers: { "X-Instance": "instance-1" } });
    const withMiddleware = faxios.create({ headers: { "X-Instance": "instance-1" } });
    withMiddleware.use(async (ctx, next) => next(ctx));

    for (const instance of [ plain, withMiddleware ]) {
      sanitized.length = 0;
      await instance.post("http://localhost/", { a: 1 }, { headers: { "X-Request": "request-1" }, env: { fetch } });

      assert.strictEqual(timesSanitized("instance-1"), 1);
      assert.strictEqual(timesSanitized("request-1"), 1);
    }
  });

  it("still sanitizes a value written as a plain property", () => {
    const headers = new FaxiosHeaders({ "X-A": "1" });
    headers["X-A"] = "a\r\nInjected: 1";
    headers.normalize(false);

    assert.strictEqual(headers.get("x-a"), "aInjected: 1");
  });
});
