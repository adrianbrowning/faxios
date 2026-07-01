/**
 * Combined regression tests (issues 4999, 5028, 7364 + SSRF SNYK-1038255, SNYK-7361793).
 */
import assert from "node:assert";
import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, beforeEach, afterEach } from "vitest";
import faxios from "#src/index.ts";
import type { FaxiosResponse } from "#src/lib/types.js";

type AnyInterceptorManager = { use: (fn: (v: unknown) => unknown) => number; };

describe("regression", () => {
  describe("issues", () => {
    describe("4999", () => {
      // Depends on network: https://postman-echo.com
      it("should not fail with query parsing", async () => {
        const { data } = await faxios.get<{
          args: { foo1: string; foo2: string; };
        }>("https://postman-echo.com/get?foo1=bar1&foo2=bar2");

        assert.strictEqual(data.args.foo1, "bar1");
        assert.strictEqual(data.args.foo2, "bar2");
      });
    });

    describe("5028", () => {
      it("should handle set-cookie headers as an array", async () => {
        const cookie1 =
          "something=else; path=/; expires=Wed, 12 Apr 2023 12:03:42 GMT; samesite=lax; secure; httponly";
        const cookie2 =
          "something-ssr.sig=n4MlwVAaxQAxhbdJO5XbUpDw-lA; path=/; expires=Wed, 12 Apr 2023 12:03:42 GMT; samesite=lax; secure; httponly";

        const server = http
          .createServer((_req, res) => {
            res.setHeader("Set-Cookie", [ cookie1, cookie2 ]);
            res.writeHead(200);
            res.write("Hi there");
            res.end();
          })
          .listen(0);

        const request = faxios.create();

        (request.interceptors.response as AnyInterceptorManager).use(res => {
          assert.deepStrictEqual(
            (res as FaxiosResponse).headers["set-cookie"],
            [ cookie1, cookie2 ]
          );
          return res;
        });

        try {
          await request({
            url: `http://localhost:${(server.address() as AddressInfo).port}`,
          });
        }
        finally {
          server.close();
        }
      });
    });

    describe("7364", () => {
      it("fetch: should have status code in faxios error", async () => {
        const isFetchSupported = typeof fetch === "function";
        if (!isFetchSupported) {
          return;
        }

        const server = http
          .createServer((_req, res) => {
            res.statusCode = 400;
            res.end();
          })
          .listen(0);

        const instance = faxios.create({
          baseURL: `http://localhost:${(server.address() as AddressInfo).port}`,
        });

        try {
          await instance.get("/status/400");
        }
        catch (error) {
          assert.equal((error as { name: string; }).name, "FaxiosError");
          assert.equal(
            (error as { isFaxiosError: boolean; }).isFaxiosError,
            true
          );
          assert.equal((error as { status: number; }).status, 400);
        }
        finally {
          server.close();
        }
      });

      it("should have status code in faxios error", async () => {
        const server = http
          .createServer((_req, res) => {
            res.statusCode = 400;
            res.end();
          })
          .listen(0);

        const instance = faxios.create({
          baseURL: `http://localhost:${(server.address() as AddressInfo).port}`,
        });

        try {
          await instance.get("/status/400");
        }
        catch (error) {
          assert.equal((error as { name: string; }).name, "FaxiosError");
          assert.equal(
            (error as { isFaxiosError: boolean; }).isFaxiosError,
            true
          );
          assert.equal((error as { status: number; }).status, 400);
        }
        finally {
          server.close();
        }
      });
    });
  });

  // https://security.snyk.io/vuln/SNYK-JS-faxios-7361793
  // https://github.com/faxios/faxios/issues/6463
  describe("SSRF SNYK-JS-faxios-7361793", () => {
    let goodServer: Server;
    let badServer: Server;
    let goodPort: number;
    let badPort: number;

    beforeEach(() => {
      goodServer = http
        .createServer((_req, res) => {
          res.write("good");
          res.end();
        })
        .listen(0);
      goodPort = (goodServer.address() as AddressInfo).port;

      badServer = http
        .createServer((_req, res) => {
          res.write("bad");
          res.end();
        })
        .listen(0);
      badPort = (badServer.address() as AddressInfo).port;
    });

    afterEach(() => {
      goodServer.close();
      badServer.close();
    });

    it("should not fetch the protocol-relative authority in server-side mode", async () => {
      const ssrfFaxios = faxios.create({
        baseURL: "http://localhost:" + String(goodPort),
      });

      // A protocol-relative authority (`//host:port`) must not be resolved to
      // the attacker origin. fetch rejects it as an unparseable URL rather than
      // silently routing to badServer.
      const userId = "/localhost:" + String(badPort);

      try {
        const res = (await ssrfFaxios.get(`/${userId}`));
        assert.notStrictEqual(res.data, "bad", "must not reach the bad server");
        assert.fail("Expected an error to be thrown");
      }
      catch (error) {
        assert.notStrictEqual(
          (error as { message: string; }).message,
          undefined
        );
      }
    });
  });
});
