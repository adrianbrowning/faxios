import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { makeSchema, mockFetch } from "./_schemaTestHelpers.js";

describe("requestSchema validation", () => {
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
});
