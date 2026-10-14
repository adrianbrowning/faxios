import assert from "node:assert";
import { describe, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.js";

describe("faxios.define()", () => {
  it("no schemas — arg is optional and resolves", async () => {
    const getHealth = faxios.define("GET", "http://localhost/health");
    const res = await getHealth({ env: { fetch: mockFetch({ ok: true }) } });
    assert.deepStrictEqual(res.data, { ok: true });
  });

  it("no schemas — callable with no arg at all", async () => {
    // define-time env so we can call with zero args
    const getHealth = faxios.define("GET", "http://localhost/health", {
      env: { fetch: mockFetch({ ok: true }) },
    });
    const res = await getHealth();
    assert.deepStrictEqual(res.data, { ok: true });
  });

  it("responseSchema — infers typed FaxiosResponse<Output>", async () => {
    type Output = { id: number; };
    const schema = makeSchema(v => ({ value: v as Output }));
    const getItem = faxios.define("GET", "http://localhost/item", { responseSchema: schema });
    const res = await getItem({ env: { fetch: mockFetch({ id: 42 }) } });
    assert.deepStrictEqual(res.data, { id: 42 });
    expectTypeOf(res.data).toEqualTypeOf<Output>();
  });

  it("pathParamsSchema — pathParams required + typed, URL substituted", async () => {
    type PP = { account: string; };
    const ppSchema = makeSchema<PP>(v => ({ value: v as PP }));
    const getProfile = faxios.define("GET", "http://localhost/{account}/profile", {
      pathParamsSchema: ppSchema,
    });

    // arg is required — parameter tuple has length >= 1
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
    assert.ok(capturedUrl.includes("/abc/profile"), `URL ${capturedUrl} missing /abc/profile`);
  });

  it("paramsSchema — params required + typed", async () => {
    type P = { q: string; };
    const pSchema = makeSchema<P>(v => ({ value: v as P }));
    const search = faxios.define("GET", "http://localhost/search", { paramsSchema: pSchema });

    // arg is required — parameter tuple has length >= 1
    expectTypeOf<Parameters<typeof search>["length"]>().toEqualTypeOf<1>();

    const res = await search({ params: { q: "hello" }, env: { fetch: mockFetch([]) } });
    assert.ok(res);
  });

  it("requestSchema — data required + typed", async () => {
    type D = { name: string; };
    const dSchema = makeSchema<D>(v => ({ value: v as D }));
    const createItem = faxios.define("POST", "http://localhost/items", { requestSchema: dSchema });

    // arg is required — parameter tuple has length >= 1
    expectTypeOf<Parameters<typeof createItem>["length"]>().toEqualTypeOf<1>();

    const res = await createItem({ data: { name: "widget" }, env: { fetch: mockFetch({ id: 1 }) } });
    assert.ok(res);
  });

  it("url and method locked — per-call values stripped", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    const getUser = faxios.define("GET", "http://localhost/users/1");
    // JS caller passes url/method, which the types forbid — both must be ignored
    const untypedCall = getUser as unknown as (config: Record<string, unknown>) => Promise<unknown>;
    await untypedCall({
      url: "http://localhost/other",
      method: "POST",
      env: {
        fetch: async (input: Request) => {
          capturedUrl = input.url;
          capturedMethod = input.method;
          return new Response(null, { status: 200 });
        },
      },
    });
    assert.strictEqual(capturedUrl, "http://localhost/users/1");
    assert.strictEqual(capturedMethod, "GET");
  });

  it("per-call env/timeout pass through and override define-time defaults", async () => {
    const getItem = faxios.define("GET", "http://localhost/item", { timeout: 9999 });
    // per-call env overrides the define-time one — if it didn't, this mock wouldn't be used
    const res = await getItem({ env: { fetch: mockFetch({ override: true }) } });
    assert.deepStrictEqual(res.data, { override: true });
  });

  it("schema validation errors propagate — responseSchema failure", async () => {
    const schema = makeSchema(() => ({ issues: [{ message: "bad response" }] }));
    const getItem = faxios.define("GET", "http://localhost/item", { responseSchema: schema });
    try {
      await getItem({ env: { fetch: mockFetch({ bad: true }) } });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE_SCHEMA);
    }
  });

  it("signal cancellation is respected", async () => {
    const controller = new AbortController();
    controller.abort();
    const getItem = faxios.define("GET", "http://localhost/item");
    try {
      await getItem({ signal: controller.signal, env: { fetch: mockFetch({}) } });
      assert.fail("should have thrown due to aborted signal");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual((err).code, FaxiosError.ERR_CANCELED);
    }
  });

  it("per-call schemas are stripped — baked schema always wins", async () => {
    const passSchema = makeSchema(v => ({ value: v }));
    const failSchema = makeSchema(() => ({ issues: [{ message: "injected" }] }));
    const getItem = faxios.define("GET", "http://localhost/item", {
      responseSchema: passSchema,
    });
    // JS caller injects a failing responseSchema — must be ignored
    const res = await (getItem as any)({
      responseSchema: failSchema,
      env: { fetch: mockFetch({ id: 1 }) },
    });
    assert.deepStrictEqual(res.data, { id: 1 });
  });

  it("define-time config merges with per-call — per-call headers win", async () => {
    let capturedHeaders: Record<string, string> = {};
    const getItem = faxios.define("GET", "http://localhost/item", {
      headers: { "x-source": "baked" },
    });
    await getItem({
      headers: { "x-source": "call", "x-extra": "yes" },
      env: {
        fetch: async (_input: Request | string | URL, init?: RequestInit) => {
          capturedHeaders = Object.fromEntries(new Headers(init?.headers as HeadersInit).entries());
          return new Response(null, { status: 200 });
        },
      },
    });
    assert.strictEqual(capturedHeaders["x-source"], "call");
    assert.strictEqual(capturedHeaders["x-extra"], "yes");
  });

  it("no baked schemas — injected schemas are silently dropped", async () => {
    const failSchema = makeSchema(() => ({ issues: [{ message: "injected" }] }));
    const getItem = faxios.define("GET", "http://localhost/item");
    // JS caller injects schemas on a define() with no baked schemas — must be ignored
    const res = await (getItem as any)({
      requestSchema: failSchema,
      paramsSchema: failSchema,
      responseSchema: failSchema,
      env: { fetch: mockFetch({ id: 1 }) },
    });
    assert.deepStrictEqual(res.data, { id: 1 });
  });

  it("per-call pathParamsSchema is stripped — baked pathParamsSchema runs and fails before fetch", async () => {
    const issues = [{ message: "baked" }];
    const bakedSchema = makeSchema<Record<string, unknown>>(() => ({ issues }));
    const passSchema = makeSchema<Record<string, unknown>>(v => ({ value: v as Record<string, unknown> }));
    const fetch = vi.fn(mockFetch({}));
    const getUser = faxios.define("GET", "http://localhost/users/{id}", { pathParamsSchema: bakedSchema });
    // JS caller injects a passing pathParamsSchema, which the types forbid — must be ignored
    const untypedCall = getUser as unknown as (config: Record<string, unknown>) => Promise<unknown>;
    await assert.rejects(
      untypedCall({ pathParams: { id: "1" }, pathParamsSchema: passSchema, env: { fetch } }),
      { code: FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA, issues }
    );
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("middleware registered after define() runs on the endpoint call", async () => {
    const api = faxios.create({ env: { fetch: mockFetch({ ok: true }) } });
    const getHealth = api.define("GET", "http://localhost/health");
    let calls = 0;
    api.use(async (ctx, next) => {
      calls++;
      return next(ctx);
    });
    await getHealth();
    assert.strictEqual(calls, 1);
  });

  it("rejects a missing or wrong pathParams, params and data at the type level", () => {
    // Type-checked by `lint:ts`; never called.
    function check() {
      const getUser = faxios.define("GET", "/users/{id}", { pathParamsSchema: z.object({ id: z.string() }) });
      const search = faxios.define("GET", "/search", { paramsSchema: z.object({ q: z.string() }) });
      const createUser = faxios.define("POST", "/users", { requestSchema: z.object({ name: z.string() }) });
      void getUser({ pathParams: { id: "1" } });
      void search({ params: { q: "x" } });
      void createUser({ data: { name: "a" } });

      // @ts-expect-error TS2554 -- an endpoint with an input schema needs its call config
      void getUser();
      // @ts-expect-error TS2345 -- pathParams is required by the pathParamsSchema
      void getUser({});
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
