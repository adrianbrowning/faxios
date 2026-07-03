import assert from "node:assert";
import { describe, it } from "vitest";
import {
  checkDeclaredContentLength,
  checkMaterializedSize,
  cleanFormDataContentType,
  encodeBodyIfNeeded,
  handleFetchCaughtError,
  settle
} from "#src/lib/adapters/fetch.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "#src/lib/types.js";

const config = {} as InternalFaxiosRequestConfig;
const request = {};

describe("checkDeclaredContentLength", () => {
  it("skips when hasMaxContentLength is false", () => {
    const headers = FaxiosHeaders.from({ "content-length": "99999" });
    assert.doesNotThrow(() =>
      checkDeclaredContentLength(headers, false, 100, config, request)
    );
  });

  it("skips when content-length header is absent", () => {
    const headers = FaxiosHeaders.from({});
    assert.doesNotThrow(() =>
      checkDeclaredContentLength(headers, true, 100, config, request)
    );
  });

  it("passes when declared length is within cap", () => {
    const headers = FaxiosHeaders.from({ "content-length": "50" });
    assert.doesNotThrow(() =>
      checkDeclaredContentLength(headers, true, 100, config, request)
    );
  });

  it("throws ERR_BAD_RESPONSE when declared length exceeds cap", () => {
    const headers = FaxiosHeaders.from({ "content-length": "200" });
    assert.throws(
      () => checkDeclaredContentLength(headers, true, 100, config, request),
      (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE);
        return true;
      }
    );
  });
});

describe("checkMaterializedSize", () => {
  it("skips when hasMaxContentLength is false", () => {
    assert.doesNotThrow(() =>
      checkMaterializedSize("x".repeat(200), false, 100, false, false, config, request)
    );
  });

  it("skips when supportsResponseStream is true", () => {
    assert.doesNotThrow(() =>
      checkMaterializedSize("x".repeat(200), true, 100, false, true, config, request)
    );
  });

  it("skips when isStreamResponse is true", () => {
    assert.doesNotThrow(() =>
      checkMaterializedSize("x".repeat(200), true, 100, true, false, config, request)
    );
  });

  it("skips when responseData is null", () => {
    assert.doesNotThrow(() =>
      checkMaterializedSize(null, true, 100, false, false, config, request)
    );
  });

  it("throws ERR_BAD_RESPONSE for oversized string", () => {
    const big = "x".repeat(200);
    assert.throws(
      () => checkMaterializedSize(big, true, 100, false, false, config, request),
      (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE);
        return true;
      }
    );
  });

  it("passes for string within cap", () => {
    assert.doesNotThrow(() =>
      checkMaterializedSize("hi", true, 100, false, false, config, request)
    );
  });

  it("throws ERR_BAD_RESPONSE for oversized ArrayBuffer (byteLength)", () => {
    const buf = new ArrayBuffer(200);
    assert.throws(
      () => checkMaterializedSize(buf, true, 100, false, false, config, request),
      (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE);
        return true;
      }
    );
  });

  it("passes for ArrayBuffer within cap", () => {
    const buf = new ArrayBuffer(50);
    assert.doesNotThrow(() =>
      checkMaterializedSize(buf, true, 100, false, false, config, request)
    );
  });

  it("throws ERR_BAD_RESPONSE for oversized Blob (size)", () => {
    const blob = new Blob([ "x".repeat(200) ]);
    assert.throws(
      () => checkMaterializedSize(blob, true, 100, false, false, config, request),
      (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, FaxiosError.ERR_BAD_RESPONSE);
        return true;
      }
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
        return true;
      }
    );
  });

  it("wraps TypeError with 'Load failed' message as ERR_NETWORK", () => {
    const te = Object.assign(new TypeError("Load failed"), { name: "TypeError" });
    const ref = makeRef();
    assert.throws(
      () => handleFetchCaughtError(te, undefined, ref, config, request),
      (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual((err).code, FaxiosError.ERR_NETWORK);
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
        return true;
      }
    );
  });
});

describe("cleanFormDataContentType", () => {
  it("deletes content-type for multipart/form-data without boundary", () => {
    const fd = new FormData();
    const headers = FaxiosHeaders.from({ "content-type": "multipart/form-data" });
    cleanFormDataContentType(fd, headers as unknown as import("#src/lib/types.js").FaxiosRequestHeaders);
    assert.strictEqual(headers.has("content-type"), false);
  });

  it("leaves content-type intact when boundary is present", () => {
    const fd = new FormData();
    const ct = "multipart/form-data; boundary=----abc";
    const headers = FaxiosHeaders.from({ "content-type": ct });
    cleanFormDataContentType(fd, headers as unknown as import("#src/lib/types.js").FaxiosRequestHeaders);
    assert.ok(headers.has("content-type"));
  });

  it("leaves non-multipart content-type untouched", () => {
    const fd = new FormData();
    const headers = FaxiosHeaders.from({ "content-type": "application/json" });
    cleanFormDataContentType(fd, headers as unknown as import("#src/lib/types.js").FaxiosRequestHeaders);
    assert.ok(headers.has("content-type"));
  });

  it("does nothing for non-FormData data", () => {
    const headers = FaxiosHeaders.from({ "content-type": "multipart/form-data" });
    cleanFormDataContentType("plain string", headers as unknown as import("#src/lib/types.js").FaxiosRequestHeaders);
    assert.ok(headers.has("content-type"));
  });
});

describe("encodeBodyIfNeeded", () => {
  const syncEncode = (str: string): Uint8Array => new TextEncoder().encode(str);

  it("encodes string with no content-type to Uint8Array", async () => {
    const result = await encodeBodyIfNeeded("hello", {}, syncEncode);
    assert.ok(result instanceof Uint8Array);
  });

  it("returns string as-is when content-type header is present", async () => {
    const headers = { "content-type": "text/plain" };
    const result = await encodeBodyIfNeeded("hello", headers, syncEncode);
    assert.strictEqual(result, "hello");
  });

  it("returns non-string data as-is", async () => {
    const obj = { foo: "bar" };
    const result = await encodeBodyIfNeeded(obj, {}, syncEncode);
    assert.strictEqual(result, obj);
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
