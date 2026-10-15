import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { describe, it } from "vitest";
import {
  startHTTPServer,
  stopHTTPServer
} from "../../../setup/server.js";
import { fetchFaxios } from "./_helpers.js";

describe.runIf(typeof fetch === "function")(
  "supports fetch with nodejs",
  () => {
    it("should support basic auth", async () => {
      const server = await startHTTPServer(
        (req, res) => res.end(req.headers.authorization)
      );

      try {
        const user = "foo";
        const headers = { Authorization: "Bearer 1234" };
        const res = await fetchFaxios.get(
          `http://${user}@localhost:${(server.address() as AddressInfo).port}/`,
          {
            headers,
          }
        );

        const base64 = Buffer.from(`${user}:`, "utf8").toString("base64");
        assert.equal(res.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should decode basic auth credentials from the request URL", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        }
      );

      try {
        const response = await fetchFaxios.get(
          `http://my%40email.com:pa%24ss@localhost:${(server.address() as AddressInfo).port}/`
        );
        const base64 = Buffer.from("my@email.com:pa$ss", "utf8").toString(
          "base64"
        );
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should UTF-8 encode basic auth credentials from the request URL", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        }
      );

      try {
        const response = await fetchFaxios.get(
          `http://%E7%94%A8%E6%88%B7:pa%C3%9F@localhost:${(server.address() as AddressInfo).port}/`
        );
        const base64 = Buffer.from("\u7528\u6237:pa\u00df", "utf8").toString(
          "base64"
        );
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should UTF-8 encode a non-ASCII config auth username", async () => {
      const server = await startHTTPServer((req, res) => res.end(req.headers.authorization));

      try {
        const response = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          { auth: { username: "\u7528\u6237", password: "pa\u00df" } }
        );
        const base64 = Buffer.from("\u7528\u6237:pa\u00df", "utf8").toString("base64");
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("keeps malformed URL credentials percent-encoding and does not throw", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        }
      );

      try {
        const response = await fetchFaxios.get(
          `http://user%:foo%zz@localhost:${(server.address() as AddressInfo).port}/`
        );
        const base64 = Buffer.from("user%:foo%zz", "utf8").toString("base64");
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should support password-only basic auth credentials from the request URL", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        }
      );

      try {
        const response = await fetchFaxios.get(
          `http://:secret@localhost:${(server.address() as AddressInfo).port}/`
        );
        const base64 = Buffer.from(":secret", "utf8").toString("base64");
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should prefer config auth over basic auth credentials from the request URL", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        }
      );

      try {
        const auth = { username: "config-user", password: "config-pass" };
        const response = await fetchFaxios.get(
          `http://url-user:url-pass@localhost:${(server.address() as AddressInfo).port}/`,
          { auth }
        );
        const base64 = Buffer.from("config-user:config-pass", "utf8").toString(
          "base64"
        );
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should support basic auth with a header", async () => {
      const server = await startHTTPServer(
        (req, res) => {
          res.end(req.headers.authorization);
        }
      );

      try {
        const auth = { username: "foo", password: "bar" };
        const headers = { AuThOrIzAtIoN: "Bearer 1234" }; // wonky casing to ensure caseless comparison
        const response = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            auth,
            headers,
          }
        );
        const base64 = Buffer.from("foo:bar", "utf8").toString("base64");
        assert.strictEqual(response.data, `Basic ${base64}`);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("should ignore inherited nested auth fields", async () => {
      const server = await startHTTPServer(
        (req, res) => res.end(req.headers.authorization)
      );

      // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
      Object.defineProperty(Object.prototype, "username", {
        value: "inherited-user",
        configurable: true,
      });
      // eslint-disable-next-line no-extend-native -- prototype-pollution test; removed in finally
      Object.defineProperty(Object.prototype, "password", {
        value: "inherited-pass",
        configurable: true,
      });

      try {
        const response = await fetchFaxios.get(
          `http://localhost:${(server.address() as AddressInfo).port}/`,
          {
            auth: {} as { password: string; username: string; },
          }
        );

        assert.strictEqual(response.data, "Basic Og==");
      }
      finally {
        delete (Object.prototype as Record<string, unknown>).username;
        delete (Object.prototype as Record<string, unknown>).password;
        await stopHTTPServer(server);
      }
    });
  }
);
