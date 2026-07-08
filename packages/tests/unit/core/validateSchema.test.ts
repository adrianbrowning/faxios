import assert from "node:assert";
import { describe, it } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { validateSchema } from "#src/lib/core/validateSchema.js";
import type { InternalFaxiosRequestConfig } from "#src/lib/types.js";
import { makeSchema } from "./_schemaTestHelpers.js";

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
});
