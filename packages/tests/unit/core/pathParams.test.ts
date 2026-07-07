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
        fetch: async (input: string | URL | Request) => {
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
        fetch: async (input: string | URL | Request) => {
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
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: {},
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_OPTION_VALUE);
    }
  });
});

describe("pathParamsSchema validation", () => {
  it("uses schema output for substitution on success", async () => {
    const schema = makeSchema(() => ({ value: { id: "coerced-99" } }));
    let capturedUrl = "";
    await faxios.get("http://localhost/users/{id}", {
      pathParams: { id: "raw" },
      pathParamsSchema: schema,
      env: {
        fetch: async (input: string | URL | Request) => {
          capturedUrl = input instanceof Request ? input.url : String(input);
          return new Response(null, { status: 200 });
        },
      },
    });
    assert.ok(capturedUrl.includes("/users/coerced-99"), `Expected coerced-99 in ${capturedUrl}`);
  });

  it("throws ERR_BAD_PATH_PARAMS_SCHEMA on validation failure", async () => {
    const schema = makeSchema(() => ({ issues: [{ message: "bad path params" }] }));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
    }
  });

  it("attaches issues from schema result to the error", async () => {
    const issues = [{ message: "invalid id" }];
    const schema = makeSchema(() => ({ issues }));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: "bad" },
        pathParamsSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.deepStrictEqual((err as FaxiosError & { issues: unknown; }).issues, issues);
    }
  });

  it("instance-level pathParamsSchema is used when no per-request schema", async () => {
    const schema = makeSchema(() => ({ issues: [{ message: "bad" }] }));
    const instance = faxios.create({ pathParamsSchema: schema });
    try {
      await instance.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
    }
  });

  it("per-request pathParamsSchema overrides instance-level", async () => {
    const failSchema = makeSchema(() => ({ issues: [{ message: "fail" }] }));
    const passSchema = makeSchema(v => ({ value: v }));
    const instance = faxios.create({ pathParamsSchema: failSchema });
    await instance.get("http://localhost/users/{id}", {
      pathParams: { id: 1 },
      pathParamsSchema: passSchema,
      env: { fetch: mockFetch({}) },
    });
    // no throw = per-request schema won
  });

  it("pathParamsSchema failure prevents paramsSchema from running (fail-fast)", async () => {
    const pathSchema = makeSchema(() => ({ issues: [{ message: "bad path" }] }));
    const paramsValidate = vi.fn(() => ({ value: {} }));
    const paramsSchema = makeSchema(paramsValidate);
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParams: { id: 1 },
        pathParamsSchema: pathSchema,
        params: { q: "x" },
        paramsSchema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA);
      assert.strictEqual(paramsValidate.mock.calls.length, 0);
    }
  });
});

describe("pathParams guard", () => {
  it("throws ERR_BAD_OPTION_VALUE when pathParamsSchema set but pathParams undefined", async () => {
    const schema = makeSchema(v => ({ value: v }));
    try {
      await faxios.get("http://localhost/users/{id}", {
        pathParamsSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_OPTION_VALUE);
    }
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
    const s1 = makeSchema(() => ({ value: "s1" }));
    const s2 = makeSchema(() => ({ value: "s2" }));
    const merged = mergeConfig({ pathParamsSchema: s1 }, { pathParamsSchema: s2 });
    // mergeConfig copies plain objects; verify it chose s2's validate fn
    assert.strictEqual(
      (merged.pathParamsSchema as typeof s2)?.["~standard"]?.validate,
      s2["~standard"].validate
    );
  });
});
