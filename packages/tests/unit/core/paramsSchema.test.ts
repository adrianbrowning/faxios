import assert from "node:assert";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import mergeConfig from "#src/lib/core/mergeConfig.js";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.js";

describe("paramsSchema validation", () => {
  it("replaces config.params with parsed result on success", async () => {
    const parsed = { q: "coerced" };
    const schema = makeSchema(() => ({ value: parsed }));
    let capturedUrl = "";

    await faxios.get("http://localhost/test", {
      params: { q: "raw" },
      paramsSchema: schema,
      env: {
        fetch: async (input: string | URL | Request) => {
          capturedUrl = input instanceof Request ? input.url : String(input);
          return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
        },
      },
    });
    assert.ok(capturedUrl.includes("q=coerced"), `Expected coerced in URL: ${capturedUrl}`);
  });

  it("throws FaxiosError with ERR_BAD_PARAMS_SCHEMA on failure", async () => {
    const issues = [{ message: "expected object, got string" }];
    const schema = makeSchema(() => ({ issues }));

    try {
      await faxios.get("http://localhost/test", {
        params: { q: "bad" },
        paramsSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PARAMS_SCHEMA);
    }
  });

  it("attaches issues array from schema result to the error", async () => {
    const issues = [{ message: "invalid type" }, { message: "too short", path: [ "q" ] }];
    const schema = makeSchema(() => ({ issues }));

    try {
      await faxios.get("http://localhost/test", {
        params: { q: 1 },
        paramsSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.deepStrictEqual((err as FaxiosError & { issues: unknown; }).issues, issues);
    }
  });

  it("supports async schemas returning Promise<Result>", async () => {
    const schema = makeSchema(async () => ({ value: { q: "async-ok" } }));

    await faxios.get("http://localhost/test", {
      params: { q: "raw" },
      paramsSchema: schema,
      env: { fetch: mockFetch({}) },
    });
  });

  it("validates undefined params against schema", async () => {
    const issues = [{ message: "params are required" }];
    const schema = makeSchema(v => v === undefined ? { issues } : { value: v });

    try {
      await faxios.get("http://localhost/test", {
        paramsSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PARAMS_SCHEMA);
    }
  });

  it("passes through unchanged when no paramsSchema in config", async () => {
    await faxios.get("http://localhost/test", {
      params: { q: "hello" },
      env: { fetch: mockFetch({}) },
    });
    // no throw = pass
  });

  it("wraps schema throws in FaxiosError with ERR_BAD_PARAMS_SCHEMA", async () => {
    const schema = makeSchema(() => { throw new Error("schema exploded"); });

    try {
      await faxios.get("http://localhost/test", {
        params: { q: "x" },
        paramsSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PARAMS_SCHEMA);
    }
  });

  it("instance-level paramsSchema is used when no per-request schema is set", async () => {
    const issues = [{ message: "bad params" }];
    const schema = makeSchema(() => ({ issues }));
    const instance = faxios.create({ paramsSchema: schema });

    try {
      await instance.get("http://localhost/test", {
        params: { q: "x" },
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PARAMS_SCHEMA);
    }
  });

  it("per-request paramsSchema overrides instance-level schema", async () => {
    const failSchema = makeSchema(() => ({ issues: [{ message: "fail" }] }));
    const passSchema = makeSchema(v => ({ value: v }));
    const instance = faxios.create({ paramsSchema: failSchema });

    await instance.get("http://localhost/test", {
      params: { q: "x" },
      paramsSchema: passSchema,
      env: { fetch: mockFetch({}) },
    });
    // no throw = per-request schema won
  });

  it("paramsSchema failure prevents requestSchema from running (fail-fast)", async () => {
    const paramsIssues = [{ message: "bad params" }];
    const paramsSchema = makeSchema(() => ({ issues: paramsIssues }));
    const requestValidate = vi.fn(() => ({ value: {} }));
    const requestSchema = makeSchema(requestValidate);

    try {
      await faxios.post("http://localhost/test", { body: "data" }, {
        params: { q: "x" },
        paramsSchema,
        requestSchema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_PARAMS_SCHEMA);
      assert.strictEqual(requestValidate.mock.calls.length, 0);
    }
  });
});

describe("mergeConfig paramsSchema", () => {
  it("paramsSchema uses defaultToConfig2 — config2 wins", () => {
    const s1 = makeSchema(() => ({ value: "s1" }));
    const s2 = makeSchema(() => ({ value: "s2" }));
    const merged = mergeConfig({ paramsSchema: s1 }, { paramsSchema: s2 });
    assert.strictEqual(
      (merged.paramsSchema as typeof s2)?.["~standard"]?.validate,
      s2["~standard"].validate
    );
  });

  it("paramsSchema falls back to config1 when config2 has none", () => {
    const s1 = makeSchema(() => ({ value: "s1" }));
    const merged = mergeConfig({ paramsSchema: s1 }, {});
    assert.strictEqual(
      (merged.paramsSchema as typeof s1)?.["~standard"]?.validate,
      s1["~standard"].validate
    );
  });
});
