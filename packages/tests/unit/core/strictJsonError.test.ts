import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import defaults from "#src/lib/defaults/index.js";
import type { FaxiosResponseTransformer, InternalFaxiosRequestConfig } from "#src/lib/types.js";

describe("strict JSON parse errors", () => {
  it("the default transformResponse throws the SyntaxError and leaves the error to dispatch", () => {
    const [ transformResponse ] = defaults.transformResponse as Array<FaxiosResponseTransformer>;
    const config = { responseType: "json", transitional: { forcedJSONParsing: true } } as InternalFaxiosRequestConfig;

    assert.throws(
      () => transformResponse!.call(config, "{bad json", undefined as never, 200),
      (err: unknown) => err instanceof SyntaxError && !(err instanceof FaxiosError)
    );
  });

  it("a real request with an invalid JSON body rejects ERR_BAD_RESPONSE with the response", async () => {
    const api = faxios.create({
      transitional: { forcedJSONParsing: true },
      env: { fetch: async () => new Response("{bad json", { status: 200, headers: { "content-type": "application/json" } }) },
    });

    const err = await api.get("http://localhost/x", { responseType: "json" }).then(
      () => assert.fail("must reject"),
      (e: unknown) => e
    );

    assert.ok(err instanceof FaxiosError);
    assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE);
    assert.ok(err.cause instanceof SyntaxError);
    assert.strictEqual(err.status, 200);
    assert.strictEqual(err.response?.status, 200);
    assert.strictEqual(err.response?.data, "{bad json");
  });
});
