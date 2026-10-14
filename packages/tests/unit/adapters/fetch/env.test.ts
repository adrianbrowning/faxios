import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it, vi } from "vitest";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    describe("env config", () => {
      it("should respect env fetch API configuration", async () => {
        const { data, headers } = await fetchFaxios.get("/", {
          env: {
            fetch() {
              return {
                headers: {
                  foo: "1",
                },
                text: async () => "test",
              };
            },
          } as unknown as { fetch?: typeof fetch; },
        });

        assert.strictEqual(headers.get("foo"), "1");
        assert.strictEqual(data, "test");
      });

      it("should be able to request with lack of Request object", async () => {
        const form = new FormData();

        form.append("x", "1");

        const calls: Array<{ init: RequestInit | undefined; input: unknown; }> = [];
        const { data, headers } = await fetchFaxios.post("/upload", form, {
          onUploadProgress() {
            // dummy listener to activate streaming
          },
          env: {
            Request: null,
            fetch(input: unknown, init?: RequestInit) {
              calls.push({ input, init });
              return {
                headers: {
                  foo: "1",
                },
                text: async () => "test",
              };
            },
          } as unknown as { fetch?: typeof fetch; Request?: typeof Request; },
        });

        assert.strictEqual(headers.get("foo"), "1");
        assert.strictEqual(data, "test");
        assert.strictEqual(calls.length, 1);
        const { input, init } = calls[0]!;
        assert.strictEqual(input, "http://localhost/upload", "fetch must get the URL string, not a Request");
        assert.ok(init, "fetch must get an init object");
        assert.strictEqual(init.method, "POST");
        assert.ok(init.body instanceof FormData, "the FormData body must be passed through in init");
        assert.strictEqual(init.body.get("x"), "1");
      });

      it("should be able to handle response with lack of Response object", async () => {
        const { data, headers } = await fetchFaxios.get("/", {
          onDownloadProgress() {
            // dummy listener to activate streaming
          },
          env: {
            Request: null,
            Response: null,
            fetch() {
              return {
                headers: {
                  foo: "1",
                },
                text: async () => "test",
              };
            },
          } as unknown as { fetch?: typeof fetch; Request?: typeof Request; },
        });

        assert.strictEqual(headers.get("foo"), "1");
        assert.strictEqual(data, "test");
      });

      it("should fallback to the global on undefined env value", async () => {
        const server = await startHTTPServer((_req, res) => res.end("OK"));

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              env: {
                fetch: undefined,
              },
            }
          );

          assert.strictEqual(data, "OK");
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should use current global fetch when env fetch is not specified", async () => {
        const globalFetch = global.fetch;

        vi.stubGlobal("fetch", async () => ({
          headers: {
            foo: "1",
          },
          text: async () => "global",
        }));

        const server = await startHTTPServer((_req, res) => res.end("OK"));

        try {
          const { data } = await fetchFaxios.get(
            `http://localhost:${(server.address() as AddressInfo).port}/`,
            {
              env: {
                fetch: undefined,
              },
            }
          );

          assert.strictEqual(data, "global");
        }
        finally {
          vi.stubGlobal("fetch", globalFetch);
          await stopHTTPServer(server);
        }
      });
    });
  }
);
