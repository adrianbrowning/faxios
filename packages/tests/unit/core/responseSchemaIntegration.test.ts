import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import { isSchemaValidationError } from "#src/index.ts";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.ts";

describe("responseSchema integration", () => {
  it("instance-level responseSchema validates all responses", async () => {
    const schema = makeSchema(v => ({ value: v as { id: number; } }));
    const instance = faxios.create({ responseSchema: schema });

    const res1 = await instance.get("http://localhost/a", {
      env: { fetch: mockFetch({ id: 1 }) },
    });
    const res2 = await instance.get("http://localhost/b", {
      env: { fetch: mockFetch({ id: 2 }) },
    });

    assert.deepStrictEqual(res1.data, { id: 1 });
    assert.deepStrictEqual(res2.data, { id: 2 });
  });

  it("per-request responseSchema overrides instance default", async () => {
    const instanceSchema = makeSchema(() => ({ issues: [{ message: "instance rejects" }] }));
    const requestSchema = makeSchema(v => ({ value: v as { ok: boolean; } }));
    const instance = faxios.create({ responseSchema: instanceSchema });

    const res = await instance.get("http://localhost/test", {
      responseSchema: requestSchema,
      env: { fetch: mockFetch({ ok: true }) },
    });

    assert.deepStrictEqual(res.data, { ok: true });
  });

  it("response interceptors receive validated data", async () => {
    const schema = makeSchema(v => {
      const parsed = v as { raw: string; };
      return { value: { transformed: parsed.raw.toUpperCase() } };
    });
    const instance = faxios.create({ responseSchema: schema });

    const interceptedData: Array<unknown> = [];
    instance.interceptors.response.use(response => {
      interceptedData.push(response.data);
      return response;
    });

    const res = await instance.get("http://localhost/test", {
      env: { fetch: mockFetch({ raw: "hello" }) },
    });

    assert.deepStrictEqual(res.data, { transformed: "HELLO" });
    assert.deepStrictEqual(interceptedData, [{ transformed: "HELLO" }]);
  });

  it("validation failure is catchable with isSchemaValidationError", async () => {
    const issues = [{ message: "expected number" }];
    const schema = makeSchema(() => ({ issues }));
    const instance = faxios.create({ responseSchema: schema });

    try {
      await instance.get("http://localhost/test", {
        env: { fetch: mockFetch({ bad: true }) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(isSchemaValidationError(err));
      assert.deepStrictEqual(err.issues, issues);
    }
  });
});
