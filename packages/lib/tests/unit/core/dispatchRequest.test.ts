import assert from "node:assert";
import { describe, it } from "vitest";
import AxiosHeaders from "../../../src/lib/core/AxiosHeaders.js";
import AxiosError from "../../../src/lib/core/AxiosError.js";
import dispatchRequest from "../../../src/lib/core/dispatchRequest.js";
import defaults from "../../../src/lib/defaults/index.js";
import resolveConfig from "../../../src/lib/helpers/resolveConfig.js";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "../../../src/lib/types.js";

class ReactNativeFormData {
  append() {}

  getParts() {
    return [];
  }

  get [Symbol.toStringTag]() {
    return "FormData";
  }
}

function axiosHeaders(init?: Record<string, unknown>) {
  return new AxiosHeaders(init) as unknown as InternalAxiosRequestConfig["headers"];
}

function baseConfig(overrides: Partial<InternalAxiosRequestConfig> = {}): InternalAxiosRequestConfig {
  return {
    method: "get",
    url: "/test",
    headers: axiosHeaders(),
    transformRequest: defaults.transformRequest,
    transformResponse: defaults.transformResponse,
    transitional: { silentJSONParsing: false, forcedJSONParsing: true },
    responseType: "json",
    ...overrides,
  };
}

describe("core::dispatchRequest", () => {
  describe("JSON FormData transform", () => {
    it("rejects deeply nested field paths before adapter dispatch", async () => {
      const data = new FormData();
      let adapterCalled = false;

      data.append("foo" + "[bar]".repeat(101), "123");

      const config = baseConfig({
        data,
        headers: axiosHeaders({ "Content-Type": "application/json" }),
        method: "post",
        adapter: (async (adapterConfig: InternalAxiosRequestConfig) => {
          adapterCalled = true;
          return {
            data: null,
            status: 200,
            statusText: "OK",
            headers: {},
            config: adapterConfig,
            request: {},
          };
        }) as unknown as AxiosAdapter,
      });

      let thrown;
      try {
        await dispatchRequest(config);
      } catch (e) {
        thrown = e;
      }

      assert.ok(thrown instanceof AxiosError, "must be AxiosError");
      assert.strictEqual(thrown.code, AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED);
      assert.strictEqual(adapterCalled, false);
    });
  });

  describe("JSON parse failure on adapter resolution", () => {
    it("rejects with AxiosError carrying response and status", async () => {
      const response = {
        data: "{bad json",
        status: 418,
        statusText: "I'm a teapot",
        headers: {},
        config: null,
        request: {},
      };
      const config = baseConfig({
        adapter: (async () => response) as unknown as AxiosAdapter,
      });

      let thrown;
      try {
        await dispatchRequest(config);
      } catch (e) {
        thrown = e;
      }

      assert.ok(thrown instanceof AxiosError, "must be AxiosError");
      assert.strictEqual(thrown.code, AxiosError.ERR_BAD_RESPONSE);
      assert.strictEqual(
        thrown.response,
        response,
        "error.response must be the original response",
      );
      assert.strictEqual(
        thrown.status,
        418,
        "error.status must equal response status",
      );
    });

    it("cleans up config.response after the transform throws", async () => {
      const response = {
        data: "{bad json",
        status: 200,
        statusText: "OK",
        headers: {},
        config: null,
        request: {},
      };
      const config = baseConfig({
        adapter: (async () => response) as unknown as AxiosAdapter,
      });

      try {
        await dispatchRequest(config);
      } catch (_) {
        // expected
      }

      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(config, "response"),
        false,
        "config.response must be deleted in finally",
      );
    });
  });

  describe("JSON parse failure on adapter rejection", () => {
    it("rejects with AxiosError carrying response and status (rejection path)", async () => {
      const response = {
        data: "{bad json",
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        config: null,
        request: {},
      };
      const reason = new AxiosError(
        "Request failed",
        AxiosError.ERR_BAD_RESPONSE,
      );
      reason.response = response as unknown as AxiosResponse;
      const config = baseConfig({
        adapter: (async () => { throw reason; }) as unknown as AxiosAdapter,
      });

      let thrown;
      try {
        await dispatchRequest(config);
      } catch (e) {
        thrown = e;
      }

      assert.ok(thrown instanceof AxiosError, "must be AxiosError");
      assert.strictEqual(
        thrown.response,
        response,
        "error.response must be the original response",
      );
      assert.strictEqual(
        thrown.status,
        500,
        "error.status must equal response status",
      );
    });

    it("cleans up config.response after the rejection-path transform", async () => {
      const response = {
        data: "{bad json",
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        config: null,
        request: {},
      };
      const reason = new AxiosError(
        "Request failed",
        AxiosError.ERR_BAD_RESPONSE,
      );
      reason.response = response as unknown as AxiosResponse;
      const config = baseConfig({
        adapter: (async () => { throw reason; }) as unknown as AxiosAdapter,
      });

      try {
        await dispatchRequest(config);
      } catch (_) {
        // expected
      }

      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(config, "response"),
        false,
        "config.response must be deleted in finally on the rejection path",
      );
    });
  });

  describe("happy path", () => {
    it("clears default Content-Type for React Native FormData before adapter headers are sent", async () => {
      const data = new ReactNativeFormData();
      const response = {
        data: '{"ok":true}',
        status: 200,
        statusText: "OK",
        headers: {},
        config: null,
        request: {},
      };
      const config = baseConfig({
        method: "post",
        data,
        adapter: (async (adapterConfig: InternalAxiosRequestConfig) => {
          type HeadersWithMethods = { getContentType(): unknown; toJSON(): Record<string, unknown> };
          assert.strictEqual(
            (adapterConfig.headers as unknown as HeadersWithMethods).getContentType(),
            "application/x-www-form-urlencoded",
            "dispatchRequest should apply the default POST Content-Type first",
          );

          const resolvedConfig = resolveConfig(adapterConfig);
          const resolvedHeaders = resolvedConfig.headers as unknown as HeadersWithMethods;

          assert.strictEqual(resolvedConfig.data, data);
          assert.strictEqual(
            resolvedHeaders.getContentType(),
            undefined,
          );
          assert.strictEqual(
            Object.prototype.hasOwnProperty.call(
              resolvedHeaders.toJSON(),
              "Content-Type",
            ),
            false,
            "resolved adapter headers must omit Content-Type for React Native FormData",
          );

          return response;
        }) as unknown as AxiosAdapter,
      });

      const result = await dispatchRequest(config);

      assert.deepStrictEqual(result.data, { ok: true });
    });

    it("cleans up config.response after a successful resolution", async () => {
      const response = {
        data: '{"ok":true}',
        status: 200,
        statusText: "OK",
        headers: {},
        config: null,
        request: {},
      };
      const config = baseConfig({
        adapter: (async () => response) as unknown as AxiosAdapter,
      });

      const result = await dispatchRequest(config);

      assert.deepStrictEqual(result.data, { ok: true });
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(config, "response"),
        false,
        "config.response must not be left set after a successful request",
      );
    });
  });
});
