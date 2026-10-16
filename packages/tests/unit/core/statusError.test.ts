import assert from "node:assert";
import { describe, it } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { statusError } from "#src/lib/core/statusError.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "#src/lib/types.js";

describe("statusError", () => {
  function makeResponse(status: number, validateStatusFn?: ((s: number) => boolean) | null | undefined): FaxiosResponse {
    const validateStatus = validateStatusFn === undefined
      ? (s: number) => s >= 200 && s < 300
      : validateStatusFn;
    return {
      status,
      config: { validateStatus } as InternalFaxiosRequestConfig,
      request: {},
    } as unknown as FaxiosResponse;
  }

  it("accepts a 200 response", () => {
    assert.strictEqual(statusError(makeResponse(200)), undefined);
  });

  it("rejects a 400 response with ERR_BAD_REQUEST", () => {
    const error = statusError(makeResponse(400));
    assert.ok(error instanceof FaxiosError);
    assert.strictEqual(error.code, FaxiosError.ERR_BAD_REQUEST);
  });

  it("rejects a 500 response with ERR_BAD_RESPONSE", () => {
    const error = statusError(makeResponse(500));
    assert.ok(error instanceof FaxiosError);
    assert.strictEqual(error.code, FaxiosError.ERR_BAD_RESPONSE);
  });

  it("uses ERR_BAD_REQUEST for 499, ERR_BAD_RESPONSE for 500 (boundary)", () => {
    assert.strictEqual(statusError(makeResponse(499))?.code, FaxiosError.ERR_BAD_REQUEST);
    assert.strictEqual(statusError(makeResponse(500))?.code, FaxiosError.ERR_BAD_RESPONSE);
  });

  it("accepts when custom validateStatus returns true for 500", () => {
    assert.strictEqual(statusError(makeResponse(500, () => true)), undefined);
  });

  it("accepts when validateStatus is null (!validateStatus branch)", () => {
    assert.strictEqual(statusError(makeResponse(400, null)), undefined);
  });

  it("accepts when status is 0 (!response.status branch)", () => {
    assert.strictEqual(statusError(makeResponse(0)), undefined);
  });

  it("error message is 'Request failed with status code N'", () => {
    assert.strictEqual(statusError(makeResponse(404))?.message, "Request failed with status code 404");
  });

  it("rejects with ERR_BAD_RESPONSE when custom validateStatus returns false for 200", () => {
    assert.strictEqual(statusError(makeResponse(200, () => false))?.code, FaxiosError.ERR_BAD_RESPONSE);
  });

  it("lets a throwing validateStatus throw", () => {
    assert.throws(() => statusError(makeResponse(200, () => { throw new Error("boom"); })), /boom/);
  });
});
