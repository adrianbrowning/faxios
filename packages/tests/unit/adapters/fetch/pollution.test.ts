import assert from "node:assert";
import { describe, it } from "vitest";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("prototype pollution hardening", () => {
      it("should ignore Object.prototype pollution on method, headers, and credentials", async () => {
        let capturedInit: RequestInit | undefined;
        const mockFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
          capturedInit = init;
          return new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } });
        };

        const polluted = Object.prototype as Record<string, unknown>;
        polluted["method"] = "EVIL";
        polluted["headers"] = { "x-injected": "yes" };
        polluted["credentials"] = "include";

        try {
          await fetchFaxios.get("http://localhost/", { env: { fetch: mockFetch } });
        }
        finally {
          delete polluted["method"];
          delete polluted["headers"];
          delete polluted["credentials"];
        }

        assert.ok(capturedInit, "fetch should have been called");
        assert.strictEqual(capturedInit.method, "GET", "polluted method must not override GET");
        assert.strictEqual(
          new Headers(capturedInit.headers).get("x-injected"),
          null,
          "polluted headers must not bleed into request"
        );
        assert.notStrictEqual(capturedInit.credentials, "include", "polluted credentials must not override");
      });
    });
  }
);
