import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import faxios from "#src/index.js";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../setup/server.js";
import { fetchFaxios } from "./fetch/_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    it("rejects malformed HTTP URLs before fetch normalization and preserves config", async () => {
      for (const url of [
        "\u0000https:example.com/users",
        "h\nttp:example.com/users",
      ]) {
        await assert.rejects(
          async () =>
            faxios.get(url, {
              headers: {
                "X-Test": "yes",
              },
            }),
          error => {
            assert.ok(error instanceof FaxiosError);
            const faxiosError = error;
            assert.strictEqual(faxiosError.code, FaxiosError.ERR_INVALID_URL);
            assert.strictEqual(
              faxiosError.message,
              "Invalid URL: missing \"//\" after protocol"
            );
            assert.strictEqual(faxiosError.config!.url, url);
            assert.strictEqual(
              faxiosError.config!.headers.get("X-Test"),
              "yes"
            );
            return true;
          }
        );
      }
    });

    it("should sanitize request headers containing CRLF characters", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              xTest: req.headers["x-test"],
              injected: req.headers.injected ?? null,
            })
          );
        }
      );

      try {
        const { data } = await fetchFaxios.get<Record<string, unknown>>(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            headers: {
              "x-test": "\tok\r\nInjected: yes ",
            },
          }
        );

        assert.strictEqual(data.xTest, "okInjected: yes");
        assert.strictEqual(data.injected, null);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should not use inherited Symbol.iterator for request headers", async () => {
      const server = await startHTTPServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            authorization: req.headers.authorization,
            xApp: req.headers["x-app"],
            xInjected: req.headers["x-injected"] ?? null,
          })
        );
      });

      try {
        (Object.prototype as Record<symbol, unknown>)[Symbol.iterator] =
          function* () {
            yield [ "X-Injected", "yes" ];
            yield [ "Authorization", "Bearer CHANGED" ];
          };

        const { data } = await fetchFaxios.get<Record<string, unknown>>(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            headers: {
              Authorization: "Bearer VALID_USER_TOKEN",
              "X-App": "safe",
            },
          }
        );

        assert.strictEqual(data.authorization, "Bearer VALID_USER_TOKEN");
        assert.strictEqual(data.xApp, "safe");
        assert.strictEqual(data.xInjected, null);
      }
      finally {
        delete (Object.prototype as Record<symbol, unknown>)[Symbol.iterator];
        await stopHTTPServer(server);
      }
    });

    it("should allow middleware to encode Unicode header values before fetch sends them", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              oprtName: req.headers.oprtname,
            })
          );
        }
      );

      const instance = faxios.create({
        baseURL: `http://localhost:${(server.address() as AddressInfo).port}`,
      }).use(async (ctx, next) => {
        ctx.config.headers.oprtName = encodeURIComponent(
          ctx.config.headers.oprtName as string
        );
        return next(ctx);
      });

      try {
        const { data } = await instance.get<Record<string, unknown>>("/", {
          headers: {
            oprtName: "请求用户",
          },
        });

        assert.strictEqual(data.oprtName, encodeURIComponent("请求用户"));
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should sanitize unencoded Unicode headers before passing them to fetch", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              xTest: req.headers["x-test"],
            })
          );
        }
      );

      try {
        const { data } = await fetchFaxios.get<Record<string, unknown>>(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            headers: {
              "x-test": "请求用户",
            },
          }
        );

        assert.strictEqual(data.xTest, "");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should combine baseURL and url", async () => {
      const server = await startHTTPServer(async (_req, res) => res.end("OK"));
      const baseURL = `http://localhost:${(server.address() as AddressInfo).port}`;
      try {
        const res = await faxios.create({ baseURL })("/foo");

        assert.equal(res.config.baseURL, baseURL);
        assert.equal(res.config.url, "/foo");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should send QUERY requests with a body through the fetch adapter", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          let body = "";
          req.on("data", chunk => {
            body += chunk;
          });
          req.on("end", () => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ method: req.method, url: req.url, body }));
          });
        },
        { port: 0 }
      );

      try {
        const { data } = await fetchFaxios.query<Record<string, unknown>>(
          `http://localhost:${(server.address() as AddressInfo).port}/search`,
          {
            selector: "field1",
          }
        );

        assert.strictEqual(data.method, "QUERY");
        assert.strictEqual(data.url, "/search");
        assert.deepStrictEqual(JSON.parse(data.body as string), {
          selector: "field1",
        });
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should support params", async () => {
      const server = await startHTTPServer((req, res) => res.end(req.url));
      try {
        const { data } = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/?test=1`,
          {
            params: {
              foo: 1,
              bar: 2,
            },
          }
        );

        assert.strictEqual(data, "/?test=1&foo=1&bar=2");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should handle fetch failed error as an FaxiosError with ERR_NETWORK code", async () => {
      try {
        await fetchFaxios("http://notExistsUrl.in.nowhere");
        assert.fail("should fail");
      }
      catch (err) {
        const axiosErr = err as FaxiosError;
        assert.strictEqual(axiosErr.code, FaxiosError.ERR_NETWORK);
        assert.strictEqual(String(axiosErr), "FaxiosError: Network Error: ENOTFOUND (GET http://notExistsUrl.in.nowhere)");
        assert.strictEqual(
          axiosErr.cause && (axiosErr.cause as { code?: string; }).code,
          "ENOTFOUND"
        );
      }
    });

    it("names the underlying reason of a refused connection, without the URL's user info or query", async () => {
      // A port that was just free and now refuses connections.
      const server = await startHTTPServer((_req, res) => res.end());
      let port: number;
      try {
        ({ port } = server.address() as AddressInfo);
      }
      finally {
        await stopHTTPServer(server);
      }

      const err = await fetchFaxios.get(`http://user:secret@127.0.0.1:${port}/items?token=secret#frag`).catch((e: unknown) => e);

      assert.ok(err instanceof FaxiosError);
      assert.strictEqual(err.code, FaxiosError.ERR_NETWORK);
      assert.strictEqual(err.message, `Network Error: ECONNREFUSED (GET http://127.0.0.1:${port}/items)`);
      assert.strictEqual(err.toJSON().cause?.code, "ECONNREFUSED");
    });

    it("should get response headers", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("foo", "bar");
          res.end(req.url);
        }
      );

      try {
        const { headers } = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            responseType: "stream",
          }
        );

        assert.strictEqual(headers.get("foo"), "bar");
      }
      finally {
        await stopHTTPServer(server);
      }
    });
  }
);
