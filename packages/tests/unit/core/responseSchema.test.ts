import assert from "node:assert";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.ts";

describe("responseSchema validation", () => {
  it("replaces response.data with result.value on success", async () => {
    const schema = makeSchema(v => ({ value: v as { id: number; name: string; } }));
    const data = { id: 1, name: "test" };

    const res = await faxios.get("http://localhost/test", {
      responseSchema: schema,
      env: { fetch: mockFetch(data) },
    });

    assert.deepStrictEqual(res.data, data);
  });

  it("throws FaxiosError with ERR_BAD_RESPONSE_SCHEMA on failure", async () => {
    const issues = [{ message: "expected string, got number" }];
    const schema = makeSchema(() => ({ issues }));

    try {
      await faxios.get("http://localhost/test", {
        responseSchema: schema,
        env: { fetch: mockFetch({ bad: true }) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE_SCHEMA);
    }
  });

  it("attaches issues array from schema result to the error", async () => {
    const issues = [{ message: "invalid type" }, { message: "too short", path: [ "name" ] }];
    const schema = makeSchema(() => ({ issues }));

    try {
      await faxios.get("http://localhost/test", {
        responseSchema: schema,
        env: { fetch: mockFetch({ x: 1 }) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.deepStrictEqual((err as FaxiosError & { issues: unknown; }).issues, issues);
    }
  });

  it("attaches response with original data to the error", async () => {
    const original = { foo: "bar" };
    const schema = makeSchema(() => ({ issues: [{ message: "nope" }] }));

    try {
      await faxios.get("http://localhost/test", {
        responseSchema: schema,
        env: { fetch: mockFetch(original) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.ok(err.response);
      assert.deepStrictEqual(err.response.data, original);
    }
  });

  it("supports async schemas returning Promise<Result>", async () => {
    const schema = makeSchema(async v => ({ value: v as { ok: boolean; } }));
    const data = { ok: true };

    const res = await faxios.get("http://localhost/test", {
      responseSchema: schema,
      env: { fetch: mockFetch(data) },
    });

    assert.deepStrictEqual(res.data, data);
  });

  it("passes through unchanged when no responseSchema in config", async () => {
    const data = { hello: "world" };

    const res = await faxios.get("http://localhost/test", {
      env: { fetch: mockFetch(data) },
    });

    assert.deepStrictEqual(res.data, data);
  });

  it("does not call validate when validateStatus rejects", async () => {
    const validate = vi.fn();
    const schema = makeSchema(validate);

    try {
      await faxios.get("http://localhost/test", {
        responseSchema: schema,
        env: { fetch: mockFetch({ error: "not found" }, 404) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.notStrictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE_SCHEMA);
      assert.strictEqual(validate.mock.calls.length, 0);
    }
  });
});
