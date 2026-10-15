import assert from "node:assert";
import vm from "node:vm";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { validateSchema } from "#src/lib/core/validateSchema.js";
import type { InternalFaxiosRequestConfig } from "#src/lib/types.js";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.js";

const dummyConfig = { method: "get", url: "/test" } as InternalFaxiosRequestConfig;

describe("core::validateSchema", () => {
  describe("issues field stripping", () => {
    it("strips extra fields from issues — only message and path preserved", async () => {
      const schema = makeSchema(() => ({
        issues: [
          { message: "bad", path: [ "a" ], context: "secret", value: 42, details: { leaked: true } } as never,
          { message: "also bad", extra: "gone" } as never,
        ],
      }));

      let err: FaxiosError | undefined;
      try { await validateSchema(schema, "input", FaxiosError.ERR_BAD_REQUEST_SCHEMA, dummyConfig); }
      catch (e) { err = e as FaxiosError; }

      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.issues!.length, 2);
      assert.deepStrictEqual(Object.keys(err.issues![0]!).sort(), [ "message", "path" ]);
      assert.deepStrictEqual(Object.keys(err.issues![1]!), [ "message" ]);
      assert.strictEqual((err.issues![0] as unknown as Record<string, unknown>)["context"], undefined);
      assert.strictEqual((err.issues![0] as unknown as Record<string, unknown>)["value"], undefined);
    });

    it("keeps only the key of each object path segment", async () => {
      // The shape of Valibot's ObjectPathItem: the rejected object and value ride along with the key.
      const input = { username: "alice", password: "hunter2" };
      const schema = makeSchema(() => ({
        issues: [{ message: "Invalid length", path: [{ type: "object", origin: "value", input, key: "password", value: "hunter2" }, 0 ] }],
      }));

      let err: FaxiosError | undefined;
      try { await validateSchema(schema, input, FaxiosError.ERR_BAD_REQUEST_SCHEMA, dummyConfig); }
      catch (e) { err = e as FaxiosError; }

      assert.ok(err instanceof FaxiosError);
      assert.deepStrictEqual(err.issues, [{ message: "Invalid length", path: [{ key: "password" }, 0 ] }]);
    });

    it("omits path key entirely when path is undefined", async () => {
      const schema = makeSchema(() => ({
        issues: [{ message: "no path", path: undefined }],
      }));

      let err: FaxiosError | undefined;
      try { await validateSchema(schema, "input", FaxiosError.ERR_BAD_PARAMS_SCHEMA, dummyConfig); }
      catch (e) { err = e as FaxiosError; }

      assert.ok(err instanceof FaxiosError);
      assert.deepStrictEqual(err.issues![0], { message: "no path" });
    });
  });

  describe("falsy-result guard", () => {
    it("throws when validate() returns undefined", async () => {
      const schema = makeSchema(() => undefined as never);

      await assert.rejects(
        async () => validateSchema(schema, "x", FaxiosError.ERR_BAD_REQUEST_SCHEMA, dummyConfig),
        (e: unknown) => e instanceof FaxiosError && e.code === FaxiosError.ERR_BAD_REQUEST_SCHEMA
          && e.message.includes("non-Result value")
      );
    });

    it("throws when validate() returns null", async () => {
      const schema = makeSchema(() => null as never);

      await assert.rejects(
        async () => validateSchema(schema, "x", FaxiosError.ERR_BAD_PARAMS_SCHEMA, dummyConfig),
        (e: unknown) => e instanceof FaxiosError && e.code === FaxiosError.ERR_BAD_PARAMS_SCHEMA
      );
    });
  });

  describe("schema-throws wrapping", () => {
    it("wraps thrown Error in FaxiosError with correct code", async () => {
      const schema = makeSchema(() => { throw new Error("schema exploded"); });

      await assert.rejects(
        async () => validateSchema(schema, "x", FaxiosError.ERR_BAD_RESPONSE_SCHEMA, dummyConfig),
        (e: unknown) => e instanceof FaxiosError
          && e.code === FaxiosError.ERR_BAD_RESPONSE_SCHEMA
          && e.message === "schema exploded"
      );
    });

    it("wraps thrown non-Error in FaxiosError", async () => {
      const schema = makeSchema(() => { throw "string error"; });

      await assert.rejects(
        async () => validateSchema(schema, "x", FaxiosError.ERR_BAD_REQUEST_SCHEMA, dummyConfig),
        (e: unknown) => e instanceof FaxiosError && e.code === FaxiosError.ERR_BAD_REQUEST_SCHEMA
      );
    });

    it("wraps an async validator that rejects in a coded schema error and never calls fetch", async () => {
      const schema = makeSchema(async () => { throw new Error("async schema exploded"); });
      const fetch = vi.fn(mockFetch({}));

      await assert.rejects(
        faxios.post("http://localhost/test", { x: 1 }, { requestSchema: schema, env: { fetch } }),
        { code: FaxiosError.ERR_BAD_REQUEST_SCHEMA, message: "async schema exploded" }
      );
      assert.strictEqual(fetch.mock.calls.length, 0);
    });
  });

  describe("cancellation re-throw passthrough", () => {
    it("does not wrap CanceledError — passes through directly", async () => {
      const ctrl = new AbortController();
      ctrl.abort();
      const configWithSignal = { ...dummyConfig, signal: ctrl.signal };

      const schema = makeSchema(() => { throw Object.assign(new Error("canceled"), { __CANCEL__: true }); });

      await assert.rejects(
        async () => validateSchema(schema, "x", FaxiosError.ERR_BAD_REQUEST_SCHEMA, configWithSignal),
        (e: unknown) => !(e instanceof FaxiosError) && (e as { __CANCEL__?: boolean; }).__CANCEL__ === true
      );
    });
  });

  describe("realm-independent results", () => {
    it("awaits a Promise created in another realm", async () => {
      const schema = makeSchema(() => vm.runInNewContext("Promise.resolve({ value: { ok: 1 } })") as never);

      const value = await validateSchema(schema, "input", FaxiosError.ERR_BAD_REQUEST_SCHEMA, dummyConfig);
      assert.deepStrictEqual({ ...(value as object) }, { ok: 1 });
    });

    it("reads issues from a foreign-realm Promise", async () => {
      const schema = makeSchema(() => vm.runInNewContext("Promise.resolve({ issues: [{ message: 'bad' }] })") as never);

      await assert.rejects(
        validateSchema(schema, "input", FaxiosError.ERR_BAD_REQUEST_SCHEMA, dummyConfig),
        { code: "ERR_BAD_REQUEST_SCHEMA", message: "Schema validation failed" }
      );
    });
  });
});
