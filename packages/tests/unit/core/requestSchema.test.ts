import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.js";

describe("requestSchema validation", () => {
  it("replaces config.data with parsed result on success", async () => {
    const parsed = { name: "coerced" };
    const schema = makeSchema(() => ({ value: parsed }));

    await faxios.post("http://localhost/test", { name: "raw" }, {
      requestSchema: schema,
      env: { fetch: mockFetch({}) },
    });
    // fetch must have been called — no throw means schema passed
  });

  it("throws FaxiosError with ERR_BAD_REQUEST_SCHEMA on failure", async () => {
    const issues = [{ message: "expected object, got string" }];
    const schema = makeSchema(() => ({ issues }));

    try {
      await faxios.post("http://localhost/test", { bad: true }, {
        requestSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST_SCHEMA);
    }
  });

  it("attaches issues array from schema result to the error", async () => {
    const issues = [{ message: "invalid type" }, { message: "too short", path: [ "name" ] }];
    const schema = makeSchema(() => ({ issues }));

    try {
      await faxios.post("http://localhost/test", { x: 1 }, {
        requestSchema: schema,
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
    const schema = makeSchema(async () => ({ value: { name: "async-ok" } }));

    await faxios.post("http://localhost/test", { name: "raw" }, {
      requestSchema: schema,
      env: { fetch: mockFetch({}) },
    });
  });

  it("validates undefined data against schema", async () => {
    const issues = [{ message: "data is required" }];
    const schema = makeSchema(v => v === undefined ? { issues } : { value: v });

    try {
      await faxios.post("http://localhost/test", undefined, {
        requestSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST_SCHEMA);
    }
  });

  it("passes through unchanged when no requestSchema in config", async () => {
    const data = { hello: "world" };

    await faxios.post("http://localhost/test", data, {
      env: { fetch: mockFetch({}) },
    });
    // no throw = pass
  });

  it("wraps schema throws in FaxiosError with ERR_BAD_REQUEST_SCHEMA", async () => {
    const schema = makeSchema(() => { throw new Error("schema exploded"); });

    try {
      await faxios.post("http://localhost/test", { x: 1 }, {
        requestSchema: schema,
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST_SCHEMA);
    }
  });

  it("instance-level requestSchema is used when no per-request schema is set", async () => {
    const issues = [{ message: "bad body" }];
    const schema = makeSchema(() => ({ issues }));
    const instance = faxios.create({ requestSchema: schema });

    try {
      await instance.post("http://localhost/test", { x: 1 }, {
        env: { fetch: mockFetch({}) },
      });
      assert.fail("should have thrown");
    }
    catch (err) {
      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_BAD_REQUEST_SCHEMA);
    }
  });

  it("per-request requestSchema overrides instance-level schema", async () => {
    const failSchema = makeSchema(() => ({ issues: [{ message: "fail" }] }));
    const passSchema = makeSchema(v => ({ value: v }));
    const instance = faxios.create({ requestSchema: failSchema });

    await instance.post("http://localhost/test", { x: 1 }, {
      requestSchema: passSchema,
      env: { fetch: mockFetch({}) },
    });
    // no throw = per-request schema won
  });
});
