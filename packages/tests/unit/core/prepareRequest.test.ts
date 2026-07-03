import assert from "node:assert";
import { describe, it } from "vitest";
import prepareRequest from "#src/lib/core/prepareRequest.js";
import type { FaxiosBasicCredentials, FaxiosRequestHeaders } from "#src/lib/types.js";

class ReactNativeFormData {
  append() {}

  getParts() {
    return [];
  }

  get [Symbol.toStringTag]() {
    return "FormData";
  }
}

describe("core::prepareRequest", () => {
  it("clears Content-Type for React Native FormData", () => {
    const data = new ReactNativeFormData();
    const config = prepareRequest({
      url: "/upload",
      data,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const headers = config.headers as FaxiosRequestHeaders;
    assert.strictEqual(config.data, data);
    assert.strictEqual(headers.getContentType(), undefined);
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(
        headers.toJSON(),
        "Content-Type"
      ),
      false
    );
  });

  it("should ignore inherited nested auth fields", () => {
    Object.defineProperty(Object.prototype, "username", {
      value: "inherited-user",
      configurable: true,
    });
    Object.defineProperty(Object.prototype, "password", {
      value: "inherited-pass",
      configurable: true,
    });

    try {
      const config = prepareRequest({
        url: "/foo",
        auth: {} as FaxiosBasicCredentials,
      });

      assert.strictEqual((config.headers as FaxiosRequestHeaders).get("Authorization"), "Basic Og==");
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).username;
      delete (Object.prototype as Record<string, unknown>).password;
    }
  });

  it("should ignore inherited nested serializer fields", () => {
    let serializeInvoked = false;
    let encodeInvoked = false;

    Object.defineProperty(Object.prototype, "serialize", {
      value() {
        serializeInvoked = true;
        return "inherited=1";
      },
      configurable: true,
    });
    Object.defineProperty(Object.prototype, "encode", {
      value() {
        encodeInvoked = true;
        return "inherited";
      },
      configurable: true,
    });

    try {
      const config = prepareRequest({
        url: "/foo",
        params: { value: "a b" },
        paramsSerializer: {},
      });

      assert.strictEqual(config.url, "/foo?value=a+b");
      assert.strictEqual(serializeInvoked, false);
      assert.strictEqual(encodeInvoked, false);
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).serialize;
      delete (Object.prototype as Record<string, unknown>).encode;
    }
  });

  it("returned config is null-prototype (no Object.prototype inheritance)", () => {
    const config = prepareRequest({ url: "/test" });
    assert.strictEqual(Object.getPrototypeOf(config), null);
  });

  it("polluted Object.prototype field does not leak into prepared config", () => {
    (Object.prototype as Record<string, unknown>).maxBodyLength = 999;
    try {
      const config = prepareRequest({ url: "/test" });
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
