import assert from "node:assert";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import transformData from "#src/lib/core/transformData.js";
import defaults from "#src/lib/defaults/index.js";
import type { InternalFaxiosRequestConfig } from "#src/lib/types.js";

const transformResponse = defaults.transformResponse;
const config: InternalFaxiosRequestConfig = { headers: new FaxiosHeaders() };

describe("transformResponse", () => {
  describe("200 request", () => {
    it("parses json", () => {
      const data = "{\"message\": \"hello, world\"}";
      const result = transformData(config, transformResponse, { data, headers: { "content-type": "application/json" }, status: 200 });
      assert.strictEqual((result as { message: string; }).message, "hello, world");
    });

    it("ignores XML", () => {
      const data = "<message>hello, world</message>";
      const result = transformData(config, transformResponse, { data, headers: { "content-type": "text/xml" }, status: 200 });
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

  describe("204 request", () => {
    it("does not parse the empty string", () => {
      const data = "";
      const result = transformData(config, transformResponse, { data, headers: { "content-type": undefined }, status: 204 });
      assert.strictEqual(result, "");
    });

    it("does not parse undefined", () => {
      const data = undefined;
      const result = transformData(config, transformResponse, { data, headers: { "content-type": undefined }, status: 204 });
      assert.strictEqual(result, data);
    });
  });
});
