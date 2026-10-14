/**
 * Combined regression tests (issues 4999, 5028, 7364 + SSRF SNYK-1038255, SNYK-7361793).
 */
import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "vitest";
import faxios from "#src/index.ts";
import { startHTTPServer, stopHTTPServer } from "../setup/server.js";
import type { ExtendedServer } from "../setup/server.js";

describe("regression", () => {
  describe("issues", () => {
    describe("4999", () => {
      it("should not fail with query parsing", async () => {
        const server = await startHTTPServer((req, res) => {
          res.end(req.url);
        });

        try {
          const { data } = await faxios.get<string>(
            `http://localhost:${(server.address() as AddressInfo).port}/get?foo1=bar1&foo2=bar2`,
            { responseType: "text" }
          );

          assert.strictEqual(data, "/get?foo1=bar1&foo2=bar2");
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });

    describe("5028", () => {
      it("should handle set-cookie headers as an array", async () => {
        const cookie1 =
          "something=else; path=/; expires=Wed, 12 Apr 2023 12:03:42 GMT; samesite=lax; secure; httponly";
        const cookie2 =
          "something-ssr.sig=n4MlwVAaxQAxhbdJO5XbUpDw-lA; path=/; expires=Wed, 12 Apr 2023 12:03:42 GMT; samesite=lax; secure; httponly";

        const server = await startHTTPServer((_req, res) => {
          res.setHeader("Set-Cookie", [ cookie1, cookie2 ]);
          res.writeHead(200);
          res.write("Hi there");
          res.end();
        });

        const request = faxios.create().use(async (ctx, next) => {
          const res = await next(ctx);
          assert.deepStrictEqual(res.headers["set-cookie"], [ cookie1, cookie2 ]);
          return res;
        });

        try {
          await request({
            url: `http://localhost:${(server.address() as AddressInfo).port}`,
          });
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });

    describe("7364", () => {
      it("fetch: should have status code in faxios error", async () => {
        const isFetchSupported = typeof fetch === "function";
        if (!isFetchSupported) {
          return;
        }

        const server = await startHTTPServer((_req, res) => {
          res.statusCode = 400;
          res.end();
        });

        const instance = faxios.create({
          baseURL: `http://localhost:${(server.address() as AddressInfo).port}`,
        });

        try {
          await assert.rejects(instance.get("/status/400"), {
            name: "FaxiosError",
            isFaxiosError: true,
            status: 400,
            code: "ERR_BAD_REQUEST",
          });
        }
        finally {
          await stopHTTPServer(server);
        }
      });

      it("should have status code in faxios error", async () => {
        const server = await startHTTPServer((_req, res) => {
          res.statusCode = 400;
          res.end();
        });

        const instance = faxios.create({
          baseURL: `http://localhost:${(server.address() as AddressInfo).port}`,
        });

        try {
          await assert.rejects(instance.get("/status/400"), {
            name: "FaxiosError",
            isFaxiosError: true,
            status: 400,
            code: "ERR_BAD_REQUEST",
          });
        }
        finally {
          await stopHTTPServer(server);
        }
      });
    });
  });

  // https://security.snyk.io/vuln/SNYK-JS-AXIOS-7361793
  // https://github.com/axios/axios/issues/6463
  describe("SSRF SNYK-JS-faxios-7361793", () => {
    let goodServer: ExtendedServer;
    let badServer: ExtendedServer;
    let goodPort: number;
    let badPort: number;
    let badHits: number;

    beforeEach(async () => {
      badHits = 0;
      goodServer = await startHTTPServer((req, res) => {
        res.end(JSON.stringify({ body: "good", url: req.url }));
      });
      goodPort = (goodServer.address() as AddressInfo).port;

      badServer = await startHTTPServer((_req, res) => {
        badHits += 1;
        res.end(JSON.stringify({ body: "bad" }));
      });
      badPort = (badServer.address() as AddressInfo).port;
    });

    afterEach(async () => {
      await stopHTTPServer(goodServer);
      await stopHTTPServer(badServer);
    });

    it("should not fetch the protocol-relative authority in server-side mode", async () => {
      const ssrfFaxios = faxios.create({
        baseURL: "http://localhost:" + String(goodPort),
      });

      // A protocol-relative path (`//host:port`) must stay a path on baseURL,
      // not be resolved to the attacker origin.
      const userId = "/localhost:" + String(badPort);

      const res = await ssrfFaxios.get<{ body: string; url: string; }>(`/${userId}`);

      assert.strictEqual(res.data.body, "good");
      assert.strictEqual(res.data.url, "/localhost:" + String(badPort));
      assert.strictEqual(badHits, 0);
    });
  });
});
