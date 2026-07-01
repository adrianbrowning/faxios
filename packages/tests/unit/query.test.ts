import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import faxios from "#src/index.ts";
import { startHTTPServer, stopHTTPServer } from "../setup/server.js";

describe("QUERY method", () => {
  describe("static faxios.query()", () => {
    it("should make a request with the QUERY HTTP method", async () => {
      const response = await faxios.query("http://localhost/test", null, {
        env: {
          fetch: async (_input: string | Request | URL, init?: RequestInit) => {
            assert.strictEqual(init?.method, "QUERY");
            return new Response(null, { status: 200 });
          },
        },
      });

      assert.strictEqual(response.status, 200);
    });

    it("should support a request body", async () => {
      const requestBody = {
        selector: "field1, field2",
        filter: { active: true },
      };

      await faxios.query("http://localhost/search", requestBody, {
        env: {
          fetch: async (_input: string | Request | URL, init?: RequestInit) => {
            assert.deepStrictEqual(init?.body, JSON.stringify(requestBody));
            return new Response(null, { status: 200 });
          },
        },
      });
    });

    it("should support custom headers", async () => {
      await faxios.query("http://localhost/test", null, {
        headers: {
          "X-Custom-Header": "custom-value",
          Authorization: "Bearer token-abc",
        },
        env: {
          fetch: async (_input: string | Request | URL, init?: RequestInit) => {
            const headers = init?.headers as Record<string, string>;
            assert.strictEqual(headers["X-Custom-Header"], "custom-value");
            assert.strictEqual(headers["Authorization"], "Bearer token-abc");
            return new Response(null, { status: 200 });
          },
        },
      });
    });

    it("should work with baseURL configuration", async () => {
      const instance = faxios.create({ baseURL: "http://example.com/api" });

      await instance.query(
        "/resources",
        { fields: [ "name" ] },
        {
          env: {
            fetch: async (input: string | Request | URL, init?: RequestInit) => {
              const url = input instanceof Request ? input.url : String(input);
              assert.strictEqual(url, "http://example.com/api/resources");
              assert.strictEqual(init?.method, "QUERY");
              return new Response(null, { status: 200 });
            },
          },
        }
      );
    });

    it("should set Content-Type to application/json for object bodies", async () => {
      await faxios.query(
        "http://localhost/test",
        { key: "value" },
        {
          env: {
            fetch: async (_input: string | Request | URL, init?: RequestInit) => {
              const headers = init?.headers as Record<string, string>;
              assert.ok(
                headers["Content-Type"]?.includes("application/json"),
                "Expected Content-Type to include application/json"
              );
              return new Response(null, { status: 200 });
            },
          },
        }
      );
    });
  });

  describe("instance.query()", () => {
    it("should make a request with the QUERY HTTP method on an instance", async () => {
      const instance = faxios.create();

      const response = await instance.query("http://localhost/test", null, {
        env: {
          fetch: async (_input: string | Request | URL, init?: RequestInit) => {
            assert.strictEqual(init?.method, "QUERY");
            return new Response(null, { status: 200 });
          },
        },
      });

      assert.strictEqual(response.status, 200);
    });

    it("should merge instance defaults with request config", async () => {
      const instance = faxios.create({
        headers: { "X-Instance-Header": "from-instance" },
      });

      await instance.query("http://localhost/test", null, {
        headers: { "X-Request-Header": "from-request" },
        env: {
          fetch: async (_input: string | Request | URL, init?: RequestInit) => {
            const headers = init?.headers as Record<string, string>;
            assert.strictEqual(headers["X-Instance-Header"], "from-instance");
            assert.strictEqual(headers["X-Request-Header"], "from-request");
            return new Response(null, { status: 200 });
          },
        },
      });
    });
  });

  describe("faxios({ method: \"query\" })", () => {
    it("should support the generic request form", async () => {
      const response = await faxios({
        method: "query",
        url: "http://localhost/test",
        data: { selector: "*" },
        env: {
          fetch: async (_input: string | Request | URL, init?: RequestInit) => {
            assert.strictEqual(init?.method, "QUERY");
            assert.deepStrictEqual(init?.body, JSON.stringify({ selector: "*" }));
            return new Response(JSON.stringify({ result: "ok" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        },
      });

      assert.deepStrictEqual(response.data, { result: "ok" });
    });
  });

  describe("with HTTP server", () => {
    it("should send QUERY requests with a body to a real server", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          let body = "";
          req.on("data", chunk => {
            body += chunk;
          });
          req.on("end", () => {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                method: req.method,
                url: req.url,
                body,
                headers: req.headers,
              })
            );
          });
        },
        { port: 0 }
      );

      try {
        const { data } = await faxios.query<{ method: string; url: string; body: string; headers: Record<string, string>; }>(
          `http://localhost:${(server.address() as AddressInfo).port}/search`,
          { selector: "field1" }
        );

        assert.strictEqual(data.method, "QUERY");
        assert.strictEqual(data.url, "/search");

        const parsedBody = JSON.parse(data.body);
        assert.deepStrictEqual(parsedBody, { selector: "field1" });
        assert.ok(
          (data.headers["content-type"] ?? "").includes("application/json"),
          "Expected server to receive application/json content-type"
        );
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should send QUERY requests with custom headers to a real server", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              method: req.method,
              headers: req.headers,
            })
          );
        },
        { port: 0 }
      );

      try {
        const { data } = await faxios.query<{ method: string; headers: Record<string, string>; }>(
          `http://localhost:${(server.address() as AddressInfo).port}/test`,
          null,
          {
            headers: {
              "X-Custom": "test-value",
            },
          }
        );

        assert.strictEqual(data.method, "QUERY");
        assert.strictEqual(data.headers["x-custom"], "test-value");
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should send QUERY requests with baseURL to a real server", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              method: req.method,
              url: req.url,
            })
          );
        },
        { port: 0 }
      );

      try {
        const instance = faxios.create({
          baseURL: `http://localhost:${(server.address() as AddressInfo).port}/api`,
        });

        const { data } = await instance.query<Record<string, unknown>>("/resources", {
          fields: [ "name" ],
        });

        assert.strictEqual(data.method, "QUERY");
        assert.strictEqual(data.url, "/api/resources");
      }
      finally {
        await stopHTTPServer(server);
      }
    });
  });
});
