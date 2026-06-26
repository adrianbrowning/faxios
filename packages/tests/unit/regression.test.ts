/**
 * Combined regression tests (issues 4999, 5028, 7364 + SSRF SNYK-1038255, SNYK-7361793).
 */
import assert from "node:assert";
import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, beforeEach, afterEach } from "vitest";
import faxios from "#src/index.ts";
import platform from "#src/lib/platform/index.js";
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
      it("fetch: should have status code in axios error", async () => {
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
          adapter: "fetch",
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

      it("http: should have status code in axios error", async () => {
        const server = http
          .createServer((_req, res) => {
            res.statusCode = 400;
            res.end();
          })
          .listen(0);

        const instance = faxios.create({
          baseURL: `http://localhost:${(server.address() as AddressInfo).port}`,
          adapter: "http",
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

  // https://snyk.io/vuln/SNYK-JS-AXIOS-1038255
  // https://github.com/axios/axios/issues/3407
  // https://github.com/axios/axios/issues/3369
  describe("SSRF SNYK-JS-AXIOS-1038255", () => {
    let fail = false;
    let proxy: Server;
    let server: Server;
    let location: string;
    let evilPort: number;
    let proxyPort: number;

    beforeEach(() => {
      fail = false;
      server = http
        .createServer((_req, res) => {
          fail = true;
          res.end("rm -rf /");
        })
        .listen(0);
      evilPort = (server.address() as AddressInfo).port;

      proxy = http
        .createServer((req, res) => {
          if (
            new URL(req.url!, "http://" + req.headers.host).toString() ===
            "http://localhost:" + evilPort + "/"
          ) {
            res.end(
              JSON.stringify({
                msg: "Protected",
                headers: req.headers,
              })
            );
            return;
          }
          res.writeHead(302, { location });
          res.end();
        })
        .listen(0);
      proxyPort = (proxy.address() as AddressInfo).port;
      location = "http://localhost:" + evilPort;
    });

    afterEach(() => {
      server.close();
      proxy.close();
    });

    it("obeys proxy settings when following redirects", async () => {
      const response = await faxios<{
        msg: string;
        headers: Record<string, string>;
      }>({
        method: "get",
        url: "http://www.google.com/",
        proxy: {
          host: "localhost",
          port: proxyPort,
          auth: {
            username: "sam",
            password: "password",
          },
        },
      });

      assert.strictEqual(fail, false);
      assert.strictEqual(response.data.msg, "Protected");
      assert.strictEqual(response.data.headers.host, "localhost:" + evilPort);
      assert.strictEqual(
        response.data.headers["proxy-authorization"],
        "Basic " + Buffer.from("sam:password").toString("base64")
      );

      return response;
    });
  });

  // https://security.snyk.io/vuln/SNYK-JS-AXIOS-7361793
  // https://github.com/axios/axios/issues/6463
  describe("SSRF SNYK-JS-AXIOS-7361793", () => {
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

    it("should not fetch in server-side mode", async () => {
      const ssrfFaxios = faxios.create({
        baseURL: "http://localhost:" + String(goodPort),
      });

      const userId = "/localhost:" + String(badPort);

      try {
        await ssrfFaxios.get(`/${userId}`);
      }
      catch (error) {
        assert.ok(
          (error as { message: string; }).message.startsWith("Invalid URL")
        );
        return;
      }
      assert.fail("Expected an error to be thrown");
    });

    describe("client-side mode", () => {
      let savedHasBrowserEnv: boolean;
      let savedOrigin: string;

      beforeEach(() => {
        assert.ok(platform.hasBrowserEnv != undefined);
        savedHasBrowserEnv = platform.hasBrowserEnv;
        savedOrigin = platform.origin;
        platform.hasBrowserEnv = true;
        platform.origin = "http://localhost:" + String(goodPort);
      });

      afterEach(() => {
        platform.hasBrowserEnv = savedHasBrowserEnv;
        platform.origin = savedOrigin;
      });

      it("resolves URL relative to origin and returns bad server body", async () => {
        const ssrfFaxios = faxios.create({
          baseURL: "http://localhost:" + String(goodPort),
        });

        const userId = "/localhost:" + String(badPort);

        const response = (await ssrfFaxios.get(
          `/${userId}`
        )) as FaxiosResponse<string> & {
          config: { baseURL?: string; url?: string; };
          request: { res: { responseUrl: string; }; };
        };
        assert.strictEqual(response.data, "bad");
        assert.strictEqual(
          response.config.baseURL,
          "http://localhost:" + String(goodPort)
        );
        assert.strictEqual(
          response.config.url,
          "//localhost:" + String(badPort)
        );
        assert.strictEqual(
          response.request.res.responseUrl,
          "http://localhost:" + String(badPort) + "/"
        );
      });
    });
  });
});
