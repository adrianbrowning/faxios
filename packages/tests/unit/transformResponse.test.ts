import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import transformData from "#src/lib/core/transformData.js";
import defaults from "#src/lib/defaults/index.js";

const transformResponse = defaults.transformResponse;

describe("transformResponse", () => {
  describe("200 request", () => {
    it("parses json", () => {
      const data = "{\"message\": \"hello, world\"}";
      const result = transformData.call(
        {
          data,
          response: {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        },
        transformResponse
      );
      assert.strictEqual((result as { message: string; }).message, "hello, world");
    });

    it("ignores XML", () => {
      const data = "<message>hello, world</message>";
      const result = transformData.call(
        {
          data,
          response: {
            headers: { "content-type": "text/xml" },
            status: 200,
          },
        },
        transformResponse
      );
      assert.strictEqual(result, data);
    });
  });

  describe("an invalid JSON body on the wire", () => {
    const api = faxios.create({ env: { fetch: async () => new Response("{bad json", { status: 200 }) } });

    it("rejects with ERR_BAD_RESPONSE when responseType is explicitly json", async () => {
      await assert.rejects(api.get("http://localhost/x", { responseType: "json" }), (err: unknown) =>
        err instanceof FaxiosError &&
        err.code === FaxiosError.ERR_BAD_RESPONSE &&
        err.name === "FaxiosError" &&
        err.cause instanceof SyntaxError &&
        err.response?.status === 200);
    });

    it("resolves with the raw string when responseType is omitted", async () => {
      const response = await api.get("http://localhost/x");

      assert.strictEqual(response.data, "{bad json");
    });

    it("rejects the removed transitional.silentJSONParsing option", async () => {
      const config: Record<string, unknown> = { responseType: "json", transitional: { silentJSONParsing: true } };

      await assert.rejects(api.get("http://localhost/x", config), (err: unknown) =>
        err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION);
    });
  });

  describe("a non-JSON error body with responseType: json", () => {
    const html = "<html><body>Service Unavailable</body></html>";
    const respond = (status: number) => faxios.create({ env: { fetch: async () => new Response(html, { status }) } });

    it.each([
      [ 503, FaxiosError.ERR_BAD_RESPONSE ],
      [ 404, FaxiosError.ERR_BAD_REQUEST ],
    ])("rejects a %i with the status error, the raw body and the parse error as cause", async (status, code) => {
      await assert.rejects(respond(status).get("http://localhost/x", { responseType: "json" }), (err: unknown) => {
        assert.ok(err instanceof FaxiosError);
        assert.strictEqual(err.code, code);
        assert.strictEqual(err.message, `Request failed with status code ${status}`);
        assert.strictEqual(err.response?.status, status);
        assert.strictEqual(err.response?.data, html);
        assert.ok(err.cause instanceof FaxiosError);
        assert.strictEqual(err.cause.code, FaxiosError.ERR_BAD_RESPONSE);
        assert.ok(err.cause.cause instanceof SyntaxError);
        return true;
      });
    });
  });

  // Validation and the adapter read responseType case-insensitively; so must the JSON parse.
  describe.each([ "JSON", "Json" ])("responseType: %s", responseType => {
    const respond = (body: string) => faxios.create({ env: { fetch: async () => new Response(body, { status: 200 }) } });
    // Accepted at run time, though the type only lists the lower-case names.
    const config = { responseType } as unknown as { responseType: "json"; };

    it("parses a JSON body", async () => {
      const { data } = await respond("{\"a\":1}").get("http://localhost/x", config);

      assert.deepStrictEqual(data, { a: 1 });
    });

    it("rejects an invalid JSON body with ERR_BAD_RESPONSE", async () => {
      await assert.rejects(respond("{bad json").get("http://localhost/x", config), (err: unknown) =>
        err instanceof FaxiosError &&
        err.code === FaxiosError.ERR_BAD_RESPONSE &&
        err.cause instanceof SyntaxError);
    });
  });

  describe("malformed JSON with responseType: json", () => {
    it("throws FaxiosError with ERR_BAD_RESPONSE code", () => {
      const response = { status: 200, headers: {}, data: "{bad json" };
      const config = {
        responseType: "json",
        transitional: { forcedJSONParsing: true },
        response,
      };

      assert.throws(
        () => transformData.call(config, transformResponse, response),
        e =>
          e instanceof FaxiosError && e.code === FaxiosError.ERR_BAD_RESPONSE
      );
    });

    it("attaches response to FaxiosError so error.status and error.response are available", () => {
      // Regression test for https://github.com/axios/axios/issues/7224
      // When JSON.parse fails in strict mode, the thrown FaxiosError must carry
      // the original response so callers can inspect error.status and
      // error.response without having to re-examine the raw response.
      const response = { status: 200, headers: {}, data: "{bad json" };
      const config = {
        responseType: "json",
        transitional: { forcedJSONParsing: true },
        response,
      };

      let thrown;
      try {
        transformData.call(config, transformResponse, response);
      }
      catch (e) {
        thrown = e;
      }

      assert.ok(thrown instanceof FaxiosError, "must be FaxiosError");
      assert.strictEqual(
        thrown.status,
        200,
        "error.status must equal response status"
      );
      assert.strictEqual(
        thrown.response,
        response,
        "error.response must be the original response"
      );
    });
  });

  describe("204 request", () => {
    it("does not parse the empty string", () => {
      const data = "";
      const result = transformData.call(
        {
          data,
          response: {
            headers: { "content-type": undefined },
            status: 204,
          },
        },
        transformResponse
      );
      assert.strictEqual(result, "");
    });

    it("does not parse undefined", () => {
      const data = undefined;
      const result = transformData.call(
        {
          data,
          response: {
            headers: { "content-type": undefined },
            status: 200,
          },
        },
        transformResponse
      );
      assert.strictEqual(result, data);
    });
  });
});
