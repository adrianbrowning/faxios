import assert from "node:assert";
import { describe, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.js";

describe("faxios.route()", () => {
  it("returns a builder with all HTTP method helpers", () => {
    const r = faxios.route("/test");
    for (const m of [ "get", "post", "put", "patch", "delete", "head", "options", "query" ] as const) {
      assert.strictEqual(typeof r[m], "function");
    }
  });

  it("each method dispatches with correct method and url", async () => {
    const captured: Array<{ method?: string; url?: string; }> = [];
    const env = {
      fetch: async (input: Request | string | URL) => {
        captured.push({
          url: input instanceof Request ? input.url : String(input),
          method: input instanceof Request ? input.method : undefined,
        });
        return new Response(null, { status: 200 });
      },
    };

    const r = faxios.route("http://localhost/items", { env });
    await r.get()();
    await r.post()();
    await r.put()();
    await r.query()({ data: { q: 1 } });

    assert.strictEqual(captured[0]?.url, "http://localhost/items");
    assert.strictEqual(captured[0]?.method, "GET");
    assert.strictEqual(captured[1]?.url, "http://localhost/items");
    assert.strictEqual(captured[1]?.method, "POST");
    assert.strictEqual(captured[2]?.url, "http://localhost/items");
    assert.strictEqual(captured[2]?.method, "PUT");
    assert.strictEqual(captured[3]?.url, "http://localhost/items");
    assert.strictEqual(captured[3]?.method, "QUERY");
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
        fetch: async (input: Request | string | URL) => {
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
      fetch: async (input: Request | string | URL) => {
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

  it("method-level requestSchema validates request data", async () => {
    const failSchema = makeSchema(() => ({ issues: [{ message: "bad body" }] }));
    const r = faxios.route("http://localhost/items");
    const createItem = r.post({ requestSchema: failSchema });
    const fetch = vi.fn(mockFetch({}));
    try {
      await createItem({ data: { name: "x" }, env: { fetch } });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST_SCHEMA);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("method-level paramsSchema validates query params", async () => {
    const failSchema = makeSchema(() => ({ issues: [{ message: "bad params" }] }));
    const r = faxios.route("http://localhost/search");
    const search = r.get({ paramsSchema: failSchema });
    const fetch = vi.fn(mockFetch({}));
    try {
      await search({ params: { q: "x" }, env: { fetch } });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PARAMS_SCHEMA);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("merges route and method headers instead of replacing them", async () => {
    let sent: Headers | undefined;
    const env = {
      fetch: async (input: Request | string | URL, init?: RequestInit) => {
        sent = input instanceof Request ? input.headers : new Headers(init?.headers);
        return new Response(null, { status: 200 });
      },
    };

    const r = faxios.route("http://localhost/items", { env, headers: { "X-Route": "r", "X-Both": "route" } });
    await r.get({ headers: { "X-Method": "m", "X-Both": "method" } })();

    assert.strictEqual(sent?.get("X-Route"), "r");
    assert.strictEqual(sent?.get("X-Method"), "m");
    assert.strictEqual(sent?.get("X-Both"), "method");
  });

  it("rejects a missing or wrong pathParams, params and data at the type level", () => {
    // Type-checked by `lint:ts`; never called.
    function check() {
      const users = faxios.route("/users/{id}", { pathParamsSchema: z.object({ id: z.string() }) });
      const getUser = users.get();
      const search = faxios.route("/search").get({ paramsSchema: z.object({ q: z.string() }) });
      const createUser = faxios.route("/users").post({ requestSchema: z.object({ name: z.string() }) });
      void getUser({ pathParams: { id: "1" } });
      void search({ params: { q: "x" } });
      void createUser({ data: { name: "a" } });

      // @ts-expect-error TS2554 -- the route's pathParamsSchema makes the call config required
      void getUser();
      // @ts-expect-error TS2345 -- pathParams is required by the route's pathParamsSchema
      void users.put()({});
      // @ts-expect-error TS2322 -- id is a string
      void getUser({ pathParams: { id: 1 } });
      // @ts-expect-error TS2345 -- params is required by the paramsSchema
      void search({});
      // @ts-expect-error TS2322 -- q is a string
      void search({ params: { q: 1 } });
      // @ts-expect-error TS2345 -- data is required by the requestSchema
      void createUser({});
      // @ts-expect-error TS2322 -- name is a string
      void createUser({ data: { name: 1 } });
    }
    expectTypeOf(check).toBeFunction();
  });
});
