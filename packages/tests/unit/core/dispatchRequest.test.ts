import assert from "node:assert";
import { describe, it, vi } from "vitest";
import dispatchRequest from "#src/lib/core/dispatchRequest.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import defaults from "#src/lib/defaults/index.js";
import type { InternalFaxiosRequestConfig } from "#src/lib/types.js";

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
    url: "http://localhost/test",
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
      let fetchCalled = false;

      data.append("foo" + "[bar]".repeat(101), "123");

      const config = baseConfig({
        data,
        headers: faxiosHeaders({ "Content-Type": "application/json" }),
        method: "post",
        env: {
          fetch: async () => {
            fetchCalled = true;
            return new Response(null, { status: 200 });
          },
        },
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
      assert.strictEqual(fetchCalled, false);
    });
  });

  describe("JSON parse failure on adapter resolution", () => {
    it("rejects with FaxiosError carrying response and status", async () => {
      const config = baseConfig({
        env: {
          fetch: async () =>
            new Response("{bad json", {
              status: 418,
              statusText: "I'm a teapot",
            }),
        },
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
        thrown.response!.data,
        "{bad json",
        "error.response.data must be the unparsed body"
      );
      assert.strictEqual(
        thrown.status,
        418,
        "error.status must equal response status"
      );
    });

    it("cleans up config.response after the transform throws", async () => {
      const config = baseConfig({
        env: {
          fetch: async () => new Response("{bad json", { status: 200 }),
        },
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
      const config = baseConfig({
        env: {
          fetch: async () =>
            new Response("{bad json", {
              status: 500,
              statusText: "Internal Server Error",
            }),
        },
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
        thrown.response!.data,
        "{bad json",
        "error.response.data must be the unparsed body"
      );
      assert.strictEqual(
        thrown.status,
        500,
        "error.status must equal response status"
      );
    });

    it("cleans up config.response after the rejection-path transform", async () => {
      const config = baseConfig({
        env: {
          fetch: async () =>
            new Response("{bad json", {
              status: 500,
              statusText: "Internal Server Error",
            }),
        },
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

  describe("unsupported environment", () => {
    it("throws ERR_NOT_SUPPORT when fetch is unavailable", async () => {
      const fetchMod = await import("#src/lib/adapters/fetch.js");
      const spy = vi.spyOn(fetchMod, "getFetch").mockReturnValue(false);

      const config = baseConfig({});

      let thrown;
      try {
        await dispatchRequest(config);
      }
      catch (e) {
        thrown = e;
      }
      finally {
        spy.mockRestore();
      }

      assert.ok(thrown instanceof FaxiosError, "must be FaxiosError");
      assert.strictEqual(thrown.code, FaxiosError.ERR_NOT_SUPPORT);
    });
  });

  describe("happy path", () => {
    it("does not set Content-Type for React Native FormData (utils.isFormData detects it)", async () => {
      // ReactNativeFormData has Symbol.toStringTag === "FormData" so utils.isFormData returns true.
      // dispatchRequest must not inject application/x-www-form-urlencoded for any FormData-like object.
      const data = new ReactNativeFormData();
      let capturedInit: RequestInit | undefined;

      const config = baseConfig({
        method: "post",
        data,
        env: {
          fetch: async (_input: string | Request | URL, init?: RequestInit) => {
            capturedInit = init;
            return new Response("{\"ok\":true}", {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        },
      });

      const result = await dispatchRequest(config);

      const sentHeaders = capturedInit?.headers as Record<string, string>;
      assert.strictEqual(
        sentHeaders["Content-Type"],
        undefined,
        "dispatchRequest must not inject Content-Type for FormData-like objects"
      );
      assert.deepStrictEqual(result.data, { ok: true });
    });

    it("cleans up config.response after a successful resolution", async () => {
      const config = baseConfig({
        env: {
          fetch: async () =>
            new Response("{\"ok\":true}", {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        },
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

  describe("responseSchema validation", () => {
    it("replaces response.data with validated value on success", async () => {
      const transformed = { name: "alice", age: 30 };
      const config = baseConfig({
        responseSchema: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: (v: unknown) => ({ value: { ...v as object, validated: true } }),
          },
        },
        env: {
          fetch: async () =>
            new Response(JSON.stringify(transformed), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        },
      });

      const result = await dispatchRequest(config);

      assert.deepStrictEqual(result.data, { name: "alice", age: 30, validated: true });
    });

    it("throws FaxiosError with ERR_BAD_RESPONSE_SCHEMA on validation failure", async () => {
      const issues = [{ message: "expected string, got number", path: [ "name" ] }];
      const config = baseConfig({
        responseSchema: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: () => ({ issues }),
          },
        },
        env: {
          fetch: async () =>
            new Response(JSON.stringify({ name: 123 }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        },
      });

      let thrown: FaxiosError | undefined;
      try {
        await dispatchRequest(config);
      }
      catch (e) {
        thrown = e as FaxiosError;
      }

      assert.ok(thrown instanceof FaxiosError, "must be FaxiosError");
      assert.strictEqual(thrown.code, FaxiosError.ERR_BAD_RESPONSE_SCHEMA);
      assert.deepStrictEqual((thrown as unknown as { issues: unknown; }).issues, issues);
      assert.strictEqual(thrown.response!.status, 200);
    });

    it("supports async schema validation", async () => {
      const config = baseConfig({
        responseSchema: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: async (v: unknown) => ({ value: v }),
          },
        },
        env: {
          fetch: async () =>
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        },
      });

      const result = await dispatchRequest(config);
      assert.deepStrictEqual(result.data, { ok: true });
    });

    it("does not call validate when validateStatus rejects (HTTP error path)", async () => {
      const validate = vi.fn();
      const config = baseConfig({
        validateStatus: (status: number) => status >= 200 && status < 300,
        responseSchema: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate,
          },
        },
        env: {
          fetch: async () =>
            new Response(JSON.stringify({ error: "not found" }), {
              status: 404,
              statusText: "Not Found",
              headers: { "content-type": "application/json" },
            }),
        },
      });

      let thrown: FaxiosError | undefined;
      try {
        await dispatchRequest(config);
      }
      catch (e) {
        thrown = e as FaxiosError;
      }

      assert.ok(thrown instanceof FaxiosError, "must be FaxiosError");
      assert.strictEqual(thrown.code, FaxiosError.ERR_BAD_REQUEST);
      assert.strictEqual(validate.mock.calls.length, 0, "validate must not be called on HTTP error");
    });
  });
});
