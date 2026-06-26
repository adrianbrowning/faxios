import assert from "node:assert";
import { describe, it } from "vitest";
import dispatchRequest from "../../../src/lib/core/dispatchRequest.js";
import FaxiosError from "../../../src/lib/core/FaxiosError.js";
import FaxiosHeaders from "../../../src/lib/core/FaxiosHeaders.js";
import defaults from "../../../src/lib/defaults/index.js";
import resolveConfig from "../../../src/lib/helpers/resolveConfig.js";
import type {
  FaxiosAdapter,
  FaxiosResponse,
  InternalFaxiosRequestConfig
} from "../../../src/lib/types.js";

class ReactNativeFormData {
  append() {}

  getParts() {
    return [];
  }

  get [Symbol.toStringTag]() {
    return "FormData";
  }
}

function faxiosHeaders(init?: Record<string, unknown>) {
  return new FaxiosHeaders(
    init
  ) as unknown as InternalFaxiosRequestConfig["headers"];
}

function baseConfig(
  overrides: Partial<InternalFaxiosRequestConfig> = {}
): InternalFaxiosRequestConfig {
  return {
    method: "get",
    url: "/test",
    headers: faxiosHeaders(),
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
        headers: faxiosHeaders({ "Content-Type": "application/json" }),
        method: "post",
        adapter: (async (adapterConfig: InternalFaxiosRequestConfig) => {
          adapterCalled = true;
          return {
            data: null,
            status: 200,
            statusText: "OK",
            headers: {},
            config: adapterConfig,
            request: {},
          };
        }) as unknown as FaxiosAdapter,
      });

      let thrown;
      try {
        await dispatchRequest(config);
      }
      catch (e) {
        thrown = e;
      }

      assert.ok(thrown instanceof FaxiosError, "must be FaxiosError");
      assert.strictEqual(thrown.code, FaxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED);
      assert.strictEqual(adapterCalled, false);
    });
  });

  describe("JSON parse failure on adapter resolution", () => {
    it("rejects with FaxiosError carrying response and status", async () => {
      const response = {
        data: "{bad json",
        status: 418,
        statusText: "I'm a teapot",
        headers: {},
        config: null,
        request: {},
      };
      const config = baseConfig({
        adapter: (async () => response) as unknown as FaxiosAdapter,
      });

      let thrown;
      try {
        await dispatchRequest(config);
      }
      catch (e) {
        thrown = e;
      }

      assert.ok(thrown instanceof FaxiosError, "must be FaxiosError");
      assert.strictEqual(thrown.code, FaxiosError.ERR_BAD_RESPONSE);
      assert.strictEqual(
        thrown.response,
        response,
        "error.response must be the original response"
      );
      assert.strictEqual(
        thrown.status,
        418,
        "error.status must equal response status"
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
        adapter: (async () => response) as unknown as FaxiosAdapter,
      });

      try {
        await dispatchRequest(config);
      }
      catch (_) {
        // expected
      }

      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(config, "response"),
        false,
        "config.response must be deleted in finally"
      );
    });
  });

  describe("JSON parse failure on adapter rejection", () => {
    it("rejects with FaxiosError carrying response and status (rejection path)", async () => {
      const response = {
        data: "{bad json",
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        config: null,
        request: {},
      };
      const reason = new FaxiosError(
        "Request failed",
        FaxiosError.ERR_BAD_RESPONSE
      );
      reason.response = response as unknown as FaxiosResponse;
      const config = baseConfig({
        adapter: (async () => {
          throw reason;
        }) as unknown as FaxiosAdapter,
      });

      let thrown;
      try {
        await dispatchRequest(config);
      }
      catch (e) {
        thrown = e;
      }

      assert.ok(thrown instanceof FaxiosError, "must be FaxiosError");
      assert.strictEqual(
        thrown.response,
        response,
        "error.response must be the original response"
      );
      assert.strictEqual(
        thrown.status,
        500,
        "error.status must equal response status"
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
      const reason = new FaxiosError(
        "Request failed",
        FaxiosError.ERR_BAD_RESPONSE
      );
      reason.response = response as unknown as FaxiosResponse;
      const config = baseConfig({
        adapter: (async () => {
          throw reason;
        }) as unknown as FaxiosAdapter,
      });

      try {
        await dispatchRequest(config);
      }
      catch (_) {
        // expected
      }

      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(config, "response"),
        false,
        "config.response must be deleted in finally on the rejection path"
      );
    });
  });

  describe("happy path", () => {
    it("clears default Content-Type for React Native FormData before adapter headers are sent", async () => {
      const data = new ReactNativeFormData();
      const response = {
        data: "{\"ok\":true}",
        status: 200,
        statusText: "OK",
        headers: {},
        config: null,
        request: {},
      };
      const config = baseConfig({
        method: "post",
        data,
        adapter: (async (adapterConfig: InternalFaxiosRequestConfig) => {
          type HeadersWithMethods = {
            getContentType: () => unknown;
            toJSON: () => Record<string, unknown>;
          };
          assert.strictEqual(
            (
              adapterConfig.headers as unknown as HeadersWithMethods
            ).getContentType(),
            "application/x-www-form-urlencoded",
            "dispatchRequest should apply the default POST Content-Type first"
          );

          const resolvedConfig = resolveConfig(adapterConfig);
          const resolvedHeaders =
            resolvedConfig.headers as unknown as HeadersWithMethods;

          assert.strictEqual(resolvedConfig.data, data);
          assert.strictEqual(resolvedHeaders.getContentType(), undefined);
          assert.strictEqual(
            Object.prototype.hasOwnProperty.call(
              resolvedHeaders.toJSON(),
              "Content-Type"
            ),
            false,
            "resolved adapter headers must omit Content-Type for React Native FormData"
          );

          return response;
        }) as unknown as FaxiosAdapter,
      });

      const result = await dispatchRequest(config);

      assert.deepStrictEqual(result.data, { ok: true });
    });

    it("cleans up config.response after a successful resolution", async () => {
      const response = {
        data: "{\"ok\":true}",
        status: 200,
        statusText: "OK",
        headers: {},
        config: null,
        request: {},
      };
      const config = baseConfig({
        adapter: (async () => response) as unknown as FaxiosAdapter,
      });

      const result = await dispatchRequest(config);

      assert.deepStrictEqual(result.data, { ok: true });
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(config, "response"),
        false,
        "config.response must not be left set after a successful request"
      );
    });
  });
});
