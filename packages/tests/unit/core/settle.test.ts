import assert from "node:assert";
import { describe, it } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { settle } from "#src/lib/core/settle.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "#src/lib/types.js";

describe("settle", () => {
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

  it("resolves a 200 response", () => {
    let resolved: unknown;
    settle(r => { resolved = r; }, () => {}, makeResponse(200));
    assert.strictEqual((resolved as { status: number; }).status, 200);
  });

  it("rejects a 400 response with ERR_BAD_REQUEST", () => {
    let rejected: unknown;
    settle(() => {}, r => { rejected = r; }, makeResponse(400));
    assert.ok(rejected instanceof FaxiosError);
    assert.strictEqual((rejected).code, FaxiosError.ERR_BAD_REQUEST);
  });

  it("rejects a 500 response with ERR_BAD_RESPONSE", () => {
    let rejected: unknown;
    settle(() => {}, r => { rejected = r; }, makeResponse(500));
    assert.ok(rejected instanceof FaxiosError);
    assert.strictEqual((rejected).code, FaxiosError.ERR_BAD_RESPONSE);
  });

  it("uses ERR_BAD_REQUEST for 499, ERR_BAD_RESPONSE for 500 (boundary)", () => {
    let r499: unknown, r500: unknown;
    settle(() => {}, r => { r499 = r; }, makeResponse(499));
    settle(() => {}, r => { r500 = r; }, makeResponse(500));
    assert.strictEqual((r499 as FaxiosError).code, FaxiosError.ERR_BAD_REQUEST);
    assert.strictEqual((r500 as FaxiosError).code, FaxiosError.ERR_BAD_RESPONSE);
  });

  it("resolves when custom validateStatus returns true for 500", () => {
    let resolved: unknown;
    settle(r => { resolved = r; }, () => {}, makeResponse(500, () => true));
    assert.strictEqual((resolved as { status: number; }).status, 500);
  });

  it("resolves when validateStatus is null (!validateStatus branch)", () => {
    let resolved: unknown;
    settle(r => { resolved = r; }, () => {}, makeResponse(400, null));
    assert.strictEqual((resolved as { status: number; }).status, 400);
  });

  it("resolves when status is 0 (!response.status branch)", () => {
    let resolved: unknown;
    settle(r => { resolved = r; }, () => {}, makeResponse(0));
    assert.strictEqual((resolved as { status: number; }).status, 0);
  });

  it("error message is 'Request failed with status code N'", () => {
    let rejected: unknown;
    settle(() => {}, r => { rejected = r; }, makeResponse(404));
    assert.ok(rejected instanceof FaxiosError);
    assert.strictEqual((rejected).message, "Request failed with status code 404");
  });

  it("rejects with ERR_BAD_RESPONSE when custom validateStatus returns false for 200", () => {
    let rejected: unknown;
    settle(() => {}, r => { rejected = r; }, makeResponse(200, () => false));
    assert.ok(rejected instanceof FaxiosError);
    assert.strictEqual((rejected).code, FaxiosError.ERR_BAD_RESPONSE);
  });
});
