import assert from "node:assert";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import mergeConfig from "#src/lib/core/mergeConfig.js";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.js";

describe("pathParams substitution", () => {
  it("substitutes path params into url", async () => {
    let capturedUrl = "";
    await faxios.get("http://localhost/users/{id}", {
      pathParams: { id: 42 },
      env: {
        fetch: async (input: Request | string | URL) => {
          capturedUrl = input instanceof Request ? input.url : String(input);
          return new Response(null, { status: 200 });
        },
      },
    });
    assert.ok(capturedUrl.includes("/users/42"), `Expected /users/42 in ${capturedUrl}`);
  });

  it("leaves url untouched when no pathParams in config", async () => {
    let capturedUrl = "";
    await faxios.get("http://localhost/users/{id}", {
      env: {
        fetch: async (input: Request | string | URL) => {
          capturedUrl = input instanceof Request ? input.url : String(input);
          return new Response(null, { status: 200 });
        },
      },
    });
    // braces may be percent-encoded; either form means no substitution occurred
    assert.ok(
      capturedUrl.includes("/{id}") || capturedUrl.includes("/%7Bid%7D"),
      `Expected unsubstituted placeholder in ${capturedUrl}`
    );
  });

  it("throws ERR_BAD_OPTION_VALUE when placeholder has no matching key", async () => {
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: {},
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("rejects a missing path param with one FaxiosError: its cause is not another FaxiosError", async () => {
    const fetch = vi.fn(mockFetch({}));
    const instance = faxios.create({ baseURL: "http://localhost", env: { fetch } });
    const isMissingParam = (err: unknown) => err instanceof FaxiosError &&
      err.code === FaxiosError.ERR_BAD_OPTION_VALUE &&
      err.message === "Path param \"id\" not found in pathParams" &&
      !(err.cause instanceof FaxiosError) &&
      err.config !== undefined;

    await assert.rejects(instance.get("/users/{id}", { pathParams: {} }), isMissingParam);
    // With a schema, substitution runs on its output.
    const passSchema = makeSchema<Record<string, unknown>>(v => ({ value: v as Record<string, unknown> }));
    await assert.rejects(instance.get("/users/{id}", { pathParams: {}, pathParamsSchema: passSchema }), isMissingParam);
    assert.throws(() => instance.getUri({ url: "/users/{id}", pathParams: {} }), isMissingParam);
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("rejects an empty path param before fetch is called", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const expected = { code: "ERR_BAD_OPTION_VALUE", message: "Path param \"id\" must not be empty" };
    for (const id of [ "", []]) {
      await assert.rejects(faxios.get("http://localhost/users/{id}/posts", { pathParams: { id }, env: { fetch } }), expected);
      assert.throws(() => faxios.getUri({ url: "http://localhost/users/{id}/posts", pathParams: { id } }), expected);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("rejects dot segments, plain or percent-encoded, before fetch is called", async () => {
    for (const id of [ ".", "..", "%2e", "%2e%2e", "%2E%2e", ".%2e", "%2E." ]) {
      const fetch = vi.fn(async () => new Response(null, { status: 200 }));
      await assert.rejects(
        faxios.get("http://localhost/users/{id}", { pathParams: { id }, env: { fetch } }),
        (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes("\"id\""),
        `id=${id}`
      );
      assert.strictEqual(fetch.mock.calls.length, 0, `id=${id}`);
    }
  });

  it("still accepts values that only contain dots", async () => {
    let capturedUrl = "";
    await faxios.get("http://localhost/files/{name}", {
      pathParams: { name: "..." },
      env: {
        fetch: async (input: Request | string | URL) => {
          capturedUrl = input instanceof Request ? input.url : String(input);
          return new Response(null, { status: 200 });
        },
      },
    });
    assert.ok(capturedUrl.endsWith("/files/..."), capturedUrl);
  });
});

describe("pathParamsSchema validation", () => {
  it("uses schema output for substitution on success", async () => {
    const schema = makeSchema<Record<string, unknown>>(() => ({ value: { id: "coerced-99" } }));
    let capturedUrl = "";
    await faxios.get("http://localhost/users/{id}", {
      pathParams: { id: "raw" },
      pathParamsSchema: schema,
      env: {
        fetch: async (input: Request | string | URL) => {
          capturedUrl = input instanceof Request ? input.url : String(input);
          return new Response(null, { status: 200 });
        },
      },
    });
    assert.ok(capturedUrl.includes("/users/coerced-99"), `Expected coerced-99 in ${capturedUrl}`);
  });

  it("throws ERR_BAD_PATH_PARAMS_SCHEMA on validation failure", async () => {
    const schema = makeSchema<Record<string, unknown>>(() => ({ issues: [{ message: "bad path params" }] }));
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: schema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("attaches issues from schema result to the error", async () => {
    const issues = [{ message: "invalid id" }];
    const schema = makeSchema<Record<string, unknown>>(() => ({ issues }));
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: "bad" },
        pathParamsSchema: schema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.deepStrictEqual((err as FaxiosError & { issues: unknown; }).issues, issues);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("instance-level pathParamsSchema is used when no per-request schema", async () => {
    const schema = makeSchema<Record<string, unknown>>(() => ({ issues: [{ message: "bad" }] }));
    const instance = faxios.create({ pathParamsSchema: schema });
    const fetch = vi.fn(mockFetch({}));
    try {
      await instance.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("per-request pathParamsSchema overrides instance-level", async () => {
    const failSchema = makeSchema<Record<string, unknown>>(() => ({ issues: [{ message: "fail" }] }));
    const passSchema = makeSchema<Record<string, unknown>>(v => ({ value: v as Record<string, unknown> }));
    const instance = faxios.create({ pathParamsSchema: failSchema });
    const fetch = vi.fn(mockFetch({}));
    const res = await instance.get("http://localhost/users/{id}", {
      pathParams: { id: 1 },
      pathParamsSchema: passSchema,
      env: { fetch },
    });
    // The instance-level failSchema would have rejected before fetch.
    assert.strictEqual(res.status, 200);
    assert.strictEqual(fetch.mock.calls.length, 1);
  });

  it("wraps schema throws in FaxiosError with ERR_BAD_PATH_PARAMS_SCHEMA", async () => {
    const schema = makeSchema<Record<string, unknown>>(() => { throw new Error("schema exploded"); });
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: schema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("throws when schema returns a falsy non-Result value", async () => {
    const schema = makeSchema<Record<string, unknown>>(() => undefined as never);
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: schema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
      assert.ok(err.message.includes("non-Result"));
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("pathParamsSchema failure prevents paramsSchema from running (fail-fast)", async () => {
    const pathSchema = makeSchema<Record<string, unknown>>(() => ({ issues: [{ message: "bad path" }] }));
    const paramsValidate = vi.fn(() => ({ value: {} }));
    const paramsSchema = makeSchema(paramsValidate);
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: pathSchema,
        params: { q: "x" },
        paramsSchema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
      assert.strictEqual(paramsValidate.mock.calls.length, 0);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });
});

describe("pathParamsSchema runtime type guards", () => {
  it("throws when schema returns { value: null }", async () => {
    const schema = makeSchema<Record<string, unknown>>(() => ({ value: null as any }));
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: schema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("throws when schema returns { value: 'string' }", async () => {
    const schema = makeSchema<Record<string, unknown>>(() => ({ value: "not-an-object" as any }));
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: schema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
      assert.ok(err.message.includes("plain object"));
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });

  it("throws when schema returns { value: [] }", async () => {
    const schema = makeSchema<Record<string, unknown>>(() => ({ value: [] as any }));
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: schema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
      assert.ok(err.message.includes("plain object"));
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });
});

describe("pathParams guard", () => {
  it("throws ERR_BAD_OPTION_VALUE when pathParamsSchema set but pathParams undefined", async () => {
    const schema = makeSchema<Record<string, unknown>>(v => ({ value: v as Record<string, unknown> }));
    const fetch = vi.fn(mockFetch({}));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParamsSchema: schema,
        env: { fetch },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    assert.strictEqual(fetch.mock.calls.length, 0);
  });
});

describe("pathParams encoding — no double-encoding through pipeline", () => {
  const captureFetch = () => {
    let url = "";
    return {
      get url() { return url; },
      fetch: async (input: Request | string | URL) => {
        url = input instanceof Request ? input.url : String(input);
        return new Response(null, { status: 200 });
      },
    };
  };

  it("slash in value is encoded once (foo/bar → foo%2Fbar)", async () => {
    const t = captureFetch();
    await faxios.get("http://localhost/{seg}", {
      pathParams: { seg: "foo/bar" },
      env: { fetch: t.fetch },
    });
    assert.ok(t.url.includes("/foo%2Fbar"), `Expected foo%2Fbar in ${t.url}`);
    assert.ok(!t.url.includes("%252F"), `Double-encoded %252F in ${t.url}`);
  });

  it("plus in value is encoded once (a+b → a%2Bb)", async () => {
    const t = captureFetch();
    await faxios.get("http://localhost/{seg}", {
      pathParams: { seg: "a+b" },
      env: { fetch: t.fetch },
    });
    assert.ok(t.url.includes("/a%2Bb"), `Expected a%2Bb in ${t.url}`);
    assert.ok(!t.url.includes("%252B"), `Double-encoded %252B in ${t.url}`);
  });

  it("pre-encoded %20 is encoded again (correct: %2520 — input is literal %20)", async () => {
    const t = captureFetch();
    await faxios.get("http://localhost/{seg}", {
      pathParams: { seg: "hello%20world" },
      env: { fetch: t.fetch },
    });
    // encodeURIComponent encodes % → %25, so input "hello%20world" becomes "hello%2520world"
    assert.ok(t.url.includes("/hello%2520world"), `Expected hello%2520world in ${t.url}`);
  });

  it("space in value is encoded as %20", async () => {
    const t = captureFetch();
    await faxios.get("http://localhost/{seg}", {
      pathParams: { seg: "hello world" },
      env: { fetch: t.fetch },
    });
    assert.ok(t.url.includes("/hello%20world"), `Expected hello%20world in ${t.url}`);
  });

  it("question mark and hash in value are encoded into the path, not parsed as query/fragment", async () => {
    const t = captureFetch();
    await faxios.get("http://localhost/{seg}", {
      pathParams: { seg: "a?b#c" },
      env: { fetch: t.fetch },
    });
    assert.strictEqual(t.url, "http://localhost/a%3Fb%23c");
  });
});

describe("mergeConfig pathParams/pathParamsSchema", () => {
  it("pathParams uses defaultToConfig2 — config2 wins", () => {
    const merged = mergeConfig(
      { pathParams: { id: 1 } },
      { pathParams: { id: 99 } }
    );
    assert.deepStrictEqual(merged.pathParams, { id: 99 });
  });

  it("pathParams falls back to config1 when config2 has none", () => {
    const merged = mergeConfig({ pathParams: { id: 1 } }, {});
    assert.deepStrictEqual(merged.pathParams, { id: 1 });
  });

  it("pathParamsSchema uses defaultToConfig2 — config2 wins", () => {
    const s1 = makeSchema<Record<string, unknown>>(() => ({ value: { a: "s1" } }));
    const s2 = makeSchema<Record<string, unknown>>(() => ({ value: { a: "s2" } }));
    const merged = mergeConfig({ pathParamsSchema: s1 }, { pathParamsSchema: s2 });
    assert.strictEqual(
      merged.pathParamsSchema?.["~standard"]?.validate,
      s2["~standard"].validate
    );
  });

  it("pathParamsSchema falls back to config1 when config2 has none", () => {
    const s1 = makeSchema<Record<string, unknown>>(() => ({ value: { a: "s1" } }));
    const merged = mergeConfig({ pathParamsSchema: s1 }, {});
    assert.strictEqual(
      merged.pathParamsSchema?.["~standard"]?.validate,
      s1["~standard"].validate
    );
  });
});
