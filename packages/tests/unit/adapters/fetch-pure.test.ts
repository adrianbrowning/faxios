import assert from "node:assert";
import { describe, it } from "vitest";
import {
  checkDeclaredContentLength,
  checkMaterializedSize,
  handleFetchCaughtError
} from "#src/lib/adapters/fetch-helpers.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import { settle } from "#src/lib/core/settle.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "#src/lib/types.js";

const config = {} as InternalFaxiosRequestConfig;
const request = {};

const isContentTooLarge = (limit: number) => (err: unknown) => {
  assert.ok(err instanceof FaxiosError);
  assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE);
  assert.strictEqual(err.message, `maxContentLength size of ${limit} exceeded`);
  return true;
};

describe("checkDeclaredContentLength", () => {
  it("skips when hasMaxContentLength is false", () => {
    const headers = FaxiosHeaders.from({ "content-length": "99999" });
    assert.doesNotThrow(() =>
      checkDeclaredContentLength(headers, "get", 200, false, 100, config, request)
    );
  });

  it("skips when content-length header is absent", () => {
    const headers = FaxiosHeaders.from({});
    assert.doesNotThrow(() =>
      checkDeclaredContentLength(headers, "get", 200, true, 100, config, request)
    );
  });

  it("passes when declared length is exactly the cap", () => {
    const headers = FaxiosHeaders.from({ "content-length": "100" });
    assert.doesNotThrow(() =>
      checkDeclaredContentLength(headers, "get", 200, true, 100, config, request)
    );
  });

  it("throws ERR_BAD_RESPONSE when declared length is one byte over the cap", () => {
    const headers = FaxiosHeaders.from({ "content-length": "101" });
    assert.throws(
      () => checkDeclaredContentLength(headers, "get", 200, true, 100, config, request),
      isContentTooLarge(100)
    );
  });

  it.each([
    [ "head", 200 ],
    [ "get", 204 ],
    [ "get", 205 ],
    [ "get", 304 ],
  ])("skips a %s %i, which has no body", (method, status) => {
    const headers = FaxiosHeaders.from({ "content-length": "200" });
    assert.doesNotThrow(() =>
      checkDeclaredContentLength(headers, method, status, true, 100, config, request)
    );
  });
});

describe("checkMaterializedSize", () => {
  it("skips when hasMaxContentLength is false", () => {
    assert.doesNotThrow(() =>
      checkMaterializedSize("x".repeat(200), false, 100, false, config, request)
    );
  });

  it("skips a body the stream wrapper counted while it was read", () => {
    assert.doesNotThrow(() =>
      checkMaterializedSize("x".repeat(200), true, 100, true, config, request)
    );
  });

  it("skips when responseData is null", () => {
    assert.doesNotThrow(() =>
      checkMaterializedSize(null, true, 100, false, config, request)
    );
  });

  it.each([
    [ "string", (n: number) => "x".repeat(n) ],
    [ "ArrayBuffer (byteLength)", (n: number) => new ArrayBuffer(n) ],
    [ "Blob (size)", (n: number) => new Blob([ "x".repeat(n) ]) ],
  ])("passes a %s of exactly the cap and throws ERR_BAD_RESPONSE one byte over", (_label, make) => {
    assert.doesNotThrow(() => checkMaterializedSize(make(100), true, 100, false, config, request));
    assert.throws(
      () => checkMaterializedSize(make(101), true, 100, false, config, request),
      isContentTooLarge(100)
    );
  });

  it("measures a string in UTF-8 bytes, not UTF-16 code units", () => {
    assert.doesNotThrow(() => checkMaterializedSize("é".repeat(50), true, 100, false, config, request));
    assert.throws(
      () => checkMaterializedSize("é".repeat(51), true, 100, false, config, request),
      isContentTooLarge(100)
    );
  });
});

describe("handleFetchCaughtError", () => {
  const makeRef = (value: FaxiosError | null = null) => ({ value });

  it("surfaces composed signal FaxiosError reason with config/request attached", () => {
    const reason = new FaxiosError("Canceled", FaxiosError.ERR_CANCELED);
    const ac = new AbortController();
    ac.abort(reason);
    const ref = makeRef();
    assert.throws(
      () => handleFetchCaughtError(new Error("abort"), ac.signal, ref, config, request),
      (err: unknown) => {
        assert.strictEqual(err, reason);
        assert.strictEqual((err).code, FaxiosError.ERR_CANCELED);
        assert.strictEqual((err).message, "Canceled");
        assert.strictEqual((err).config, config);
        assert.strictEqual((err).request, request);
        return true;
      }
    );
  });

  it("attaches cause when caught error differs from composed signal reason", () => {
    const reason = new FaxiosError("Canceled", FaxiosError.ERR_CANCELED);
    const ac = new AbortController();
    ac.abort(reason);
    const raw = new Error("network blip");
    const ref = makeRef();
    assert.throws(
      () => handleFetchCaughtError(raw, ac.signal, ref, config, request),
      (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, FaxiosError.ERR_CANCELED);
        assert.strictEqual(err.message, "Canceled");
        assert.strictEqual((err).cause, raw);
        return true;
      }
    );
  });

  it("surfaces pendingBodyErrorRef.value with request attached", () => {
    const bodyErr = new FaxiosError("Body too large", FaxiosError.ERR_BAD_REQUEST);
    const ref = makeRef(bodyErr);
    assert.throws(
      () => handleFetchCaughtError(new Error("ignored"), undefined, ref, config, request),
      (err: unknown) => {
        assert.strictEqual(err, bodyErr);
        assert.strictEqual((err).code, FaxiosError.ERR_BAD_REQUEST);
        assert.strictEqual((err).message, "Body too large");
        assert.strictEqual((err).request, request);
        return true;
      }
    );
  });

  it("re-throws raw FaxiosError without wrapping", () => {
    const original = new FaxiosError("Raw", FaxiosError.ERR_NETWORK);
    const ref = makeRef();
    assert.throws(
      () => handleFetchCaughtError(original, undefined, ref, config, request),
      (err: unknown) => {
        assert.strictEqual(err, original);
        assert.strictEqual((err).code, FaxiosError.ERR_NETWORK);
        assert.strictEqual((err).message, "Raw");
        return true;
      }
    );
  });

  it.each([
    [ "a TypeError with a runtime-specific message", new TypeError("client error (Connect)"), "Network Error: client error (Connect) (GET http://example.test/)" ],
    [ "an error with a runtime-specific code", Object.assign(new Error("Unable to connect"), { code: "ConnectionRefused" }), "Network Error: ConnectionRefused (GET http://example.test/)" ],
  ])("wraps %s raised while sending as ERR_NETWORK with the error as cause", (_label, sendErr, message) => {
    const ref = makeRef();
    assert.throws(
      () => handleFetchCaughtError(sendErr, undefined, ref, config, request, "send", "http://example.test/"),
      (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, FaxiosError.ERR_NETWORK);
        assert.strictEqual(err.message, message);
        assert.strictEqual(err.cause, sendErr);
        return true;
      }
    );
  });

  it("wraps generic error via FaxiosError.from", () => {
    const generic = Object.assign(new Error("Something else"), { code: "ERR_UNKNOWN" });
    const ref = makeRef();
    assert.throws(
      () => handleFetchCaughtError(generic, undefined, ref, config, request),
      (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, "ERR_UNKNOWN");
        assert.strictEqual(err.message, "Something else");
        assert.strictEqual(err.cause, generic);
        return true;
      }
    );
  });
});

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
