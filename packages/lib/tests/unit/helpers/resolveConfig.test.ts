import assert from "node:assert";
import { describe, it } from "vitest";
import resolveConfig from "../../../src/lib/helpers/resolveConfig.js";
import type { AxiosBasicCredentials, AxiosRequestHeaders } from "../../../src/lib/types.js";

class ReactNativeFormData {
  append() {}

  getParts() {
    return [];
  }

  get [Symbol.toStringTag]() {
    return "FormData";
  }
}

describe("helpers::resolveConfig", () => {
  it("clears Content-Type for React Native FormData", () => {
    const data = new ReactNativeFormData();
    const config = resolveConfig({
      url: "/upload",
      data,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const headers = config.headers as AxiosRequestHeaders;
    assert.strictEqual(config.data, data);
    assert.strictEqual(headers.getContentType() as string | undefined, undefined);
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(
        headers.toJSON(),
        "Content-Type",
      ),
      false,
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
      const config = resolveConfig({
        url: "/foo",
        auth: {} as AxiosBasicCredentials,
      });

      assert.strictEqual((config.headers as AxiosRequestHeaders).get("Authorization") as string | null, "Basic Og==");
    } finally {
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
      const config = resolveConfig({
        url: "/foo",
        params: { value: "a b" },
        paramsSerializer: {},
      });

      assert.strictEqual(config.url, "/foo?value=a+b");
      assert.strictEqual(serializeInvoked, false);
      assert.strictEqual(encodeInvoked, false);
    } finally {
      delete (Object.prototype as Record<string, unknown>).serialize;
      delete (Object.prototype as Record<string, unknown>).encode;
    }
  });
});
