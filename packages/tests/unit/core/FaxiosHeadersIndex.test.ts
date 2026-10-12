import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";

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
