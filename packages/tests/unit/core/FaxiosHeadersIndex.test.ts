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

  it("builds the response headers from the fetch response", async () => {
    const fetch = async () => new Response("{\"ok\":true}", {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Test": "1" },
    });

    const res = await faxios.get("http://localhost/", { env: { fetch } });

    assert.ok(res.headers instanceof FaxiosHeaders);
    assert.deepStrictEqual(
      { ...res.headers.toJSON() },
      { "content-type": "application/json", "x-test": "1" }
    );
    assert.deepStrictEqual(res.data, { ok: true });
  });
});

describe("FaxiosHeaders sanitizing (#296)", () => {
  it("sends sanitized instance and request header values, with and without middleware", async () => {
    const sent: Array<Request> = [];
    const fetch = async (input: RequestInfo | URL) => {
      sent.push(input as Request);
      return new Response("ok");
    };
    const plain = faxios.create({ headers: { "X-Instance": "instance\r\nInjected: 1" } });
    const withMiddleware = faxios.create({ headers: { "X-Instance": "instance\r\nInjected: 1" } });
    withMiddleware.use(async (ctx, next) => next(ctx));

    for (const instance of [ plain, withMiddleware ]) {
      sent.length = 0;
      await instance.post("http://localhost/", { a: 1 }, { headers: { "X-Request": "request\nInjected: 2" }, env: { fetch } });

      assert.strictEqual(sent.length, 1);
      const [ request ] = sent;
      assert.strictEqual(request!.headers.get("x-instance"), "instanceInjected: 1");
      assert.strictEqual(request!.headers.get("x-request"), "requestInjected: 2");
      assert.strictEqual(request!.headers.has("injected"), false);
    }
  });

  it("still sanitizes a value written as a plain property", () => {
    const headers = new FaxiosHeaders({ "X-A": "1" });
    headers["X-A"] = "a\r\nInjected: 1";
    headers.normalize(false);

    assert.strictEqual(headers.get("x-a"), "aInjected: 1");
  });
});
