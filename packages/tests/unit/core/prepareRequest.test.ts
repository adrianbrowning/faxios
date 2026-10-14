import assert from "node:assert";
import { describe, it } from "vitest";
import type FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import prepareRequest from "#src/lib/core/prepareRequest.js";
import resolveRequestURL from "#src/lib/core/resolveRequestURL.js";

describe("core::prepareRequest", () => {
  it("leaves basic auth to the adapter, which builds the header once", () => {
    const config = prepareRequest({
      url: "/foo",
      auth: { username: "\u7528\u6237", password: "p" },
    }, "/foo");

    assert.strictEqual((config.headers as FaxiosHeaders).has("Authorization"), false);
  });

  // The URL dispatch hands to prepareRequest comes from resolveRequestURL.
  it("resolveRequestURL ignores inherited nested serializer fields", () => {
    let serializeInvoked = false;
    let encodeInvoked = false;

    // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
    Object.defineProperty(Object.prototype, "serialize", {
      value() {
        serializeInvoked = true;
        return "inherited=1";
      },
      configurable: true,
    });
    // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
    Object.defineProperty(Object.prototype, "encode", {
      value() {
        encodeInvoked = true;
        return "inherited";
      },
      configurable: true,
    });

    try {
      const url = resolveRequestURL({
        url: "/foo",
        params: { value: "a b" },
        paramsSerializer: {},
      });

      assert.strictEqual(url, "/foo?value=a+b");
      assert.strictEqual(serializeInvoked, false);
      assert.strictEqual(encodeInvoked, false);
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).serialize;
      delete (Object.prototype as Record<string, unknown>).encode;
    }
  });

  it("returned config is null-prototype (no Object.prototype inheritance)", () => {
    const config = prepareRequest({ url: "/test" }, "/test");
    assert.strictEqual(Object.getPrototypeOf(config), null);
  });

  it("polluted Object.prototype field does not leak into prepared config", () => {
    (Object.prototype as Record<string, unknown>).maxBodyLength = 999;
    try {
      const config = prepareRequest({ url: "/test" }, "/test");
      // own-property check: maxBodyLength not set on config itself
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(config, "maxBodyLength"),
        false
      );
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).maxBodyLength;
    }
  });
});
