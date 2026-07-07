import assert from "node:assert";
import { describe, it, expectTypeOf } from "vitest";
import faxios from "#src/index.ts";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.js";

describe("faxios.route()", () => {
  it("returns a builder with all HTTP method helpers", () => {
    const r = faxios.route("/test");
    for (const m of [ "get", "post", "put", "patch", "delete", "head", "options" ] as const) {
      assert.strictEqual(typeof r[m], "function");
    }
  });

  it("each method dispatches with correct method and url", async () => {
    const captured: Array<{ method?: string; url?: string; }> = [];
    const env = {
      fetch: async (input: string | URL | Request) => {
        captured.push({ url: input instanceof Request ? input.url : String(input) });
        return new Response(null, { status: 200 });
      },
    };

    const r = faxios.route("http://localhost/items", { env });
    await r.get()();
    await r.post()();
    await r.put()();

    assert.strictEqual(captured[0]?.url, "http://localhost/items");
    assert.strictEqual(captured[1]?.url, "http://localhost/items");
    assert.strictEqual(captured[2]?.url, "http://localhost/items");
  });

  it("pathParamsSchema flows through — required at call-time", async () => {
    type PP = { account: string; };
    const ppSchema = makeSchema<PP>(v => ({ value: v as PP }));

    const r = faxios.route("http://localhost/{account}/profile", { pathParamsSchema: ppSchema });
    const getProfile = r.get();

    // arg is required
    expectTypeOf<Parameters<typeof getProfile>["length"]>().toEqualTypeOf<1>();

    let capturedUrl = "";
    await getProfile({
      pathParams: { account: "abc" },
      env: {
        fetch: async (input: string | URL | Request) => {
          capturedUrl = input instanceof Request ? input.url : String(input);
          return new Response(null, { status: 200 });
        },
      },
    });
    assert.strictEqual(capturedUrl, "http://localhost/abc/profile");
  });

  it("responseSchema types the response", async () => {
    type Output = { id: number; };
    const schema = makeSchema(v => ({ value: v as Output }));

    const r = faxios.route("http://localhost/item");
    const getItem = r.get({ responseSchema: schema });

    const res = await getItem({ env: { fetch: mockFetch({ id: 42 }) } });
    assert.deepStrictEqual(res.data, { id: 42 });
    expectTypeOf(res.data).toEqualTypeOf<Output>();
  });

  it("route-level defaults merge with method-level config", async () => {
    let capturedHeaders: Record<string, string> = {};
    const env = {
      fetch: async (input: string | URL | Request) => {
        if (input instanceof Request) {
          input.headers.forEach((v, k) => { capturedHeaders[k] = v; });
        }
        return new Response(null, { status: 200 });
      },
    };

    const r = faxios.route("http://localhost/x", {
      headers: { "X-Route": "yes" },
    });
    const fn = r.get();
    await fn({ env });

    assert.strictEqual(capturedHeaders["x-route"], "yes");
  });

  it("no pathParamsSchema — callConfig is optional", async () => {
    const r = faxios.route("http://localhost/health");
    const getHealth = r.get();

    // callable with no args
    const res = await getHealth({ env: { fetch: mockFetch({ ok: true }) } });
    assert.deepStrictEqual(res.data, { ok: true });
  });
});
