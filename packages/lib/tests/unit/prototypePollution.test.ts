/* eslint-disable no-prototype-builtins */
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "vitest";
import axios from "../../src/index.ts";
import AxiosError from "../../src/lib/core/AxiosError.js";
import AxiosHeaders from "../../src/lib/core/AxiosHeaders.js";
import mergeConfig from "../../src/lib/core/mergeConfig.js";
import defaults from "../../src/lib/defaults/index.js";
import resolveConfig from "../../src/lib/helpers/resolveConfig.js";
import utils from "../../src/lib/utils.js";

// ponytail: only augment Object.prototype with non-conflicting test-only keys.
// All axios config keys overlap with AxiosRequestConfig and are accessed via ObjProto.
declare global {
  interface Object {
    polluted?: unknown;
    customNested?: unknown;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ObjProto = Object.prototype as any;

type ServerLike = http.Server;
// ponytail: cast for test ergonomics — axios.get returns Promise<unknown> in this codebase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ax = axios as any;

describe("Prototype Pollution Protection", () => {
  afterEach(() => {
    // Clean up any pollution that might have occurred.
    delete Object.prototype.polluted;
    delete ObjProto.parseReviver;
    delete ObjProto.transport;
    delete ObjProto.transformRequest;
    delete ObjProto.transformResponse;
    delete ObjProto.formSerializer;
    delete ObjProto.httpVersion;
    delete ObjProto.lookup;
    delete ObjProto.family;
    delete ObjProto.http2Options;
    delete ObjProto.validateStatus;
    delete ObjProto.auth;
    delete ObjProto.baseURL;
    delete ObjProto.socketPath;
    delete ObjProto.beforeRedirect;
    delete ObjProto.sensitiveHeaders;
    delete ObjProto.insecureHTTPParser;
    delete ObjProto.adapter;
    delete ObjProto.httpAgent;
    delete ObjProto.httpsAgent;
    delete ObjProto.proxy;
    delete ObjProto.maxContentLength;
    delete ObjProto.maxBodyLength;
    delete ObjProto.maxRedirects;
    delete ObjProto.maxRate;
    delete ObjProto.timeout;
    delete ObjProto.transitional;
    delete ObjProto.timeoutErrorMessage;
    delete ObjProto.env;
    delete ObjProto.cancelToken;
    delete ObjProto.signal;
    delete ObjProto.decompress;
    delete ObjProto.params;
    delete ObjProto.paramsSerializer;
    delete ObjProto.method;
    delete ObjProto.withCredentials;
    delete ObjProto.responseType;
    delete ObjProto.fetchOptions;
    delete ObjProto.username;
    delete ObjProto.password;
    delete ObjProto.hostname;
    delete ObjProto.host;
    delete ObjProto.port;
    delete ObjProto.protocol;
    delete ObjProto.get;
    delete ObjProto.set;
    delete ObjProto.headers;
    delete Object.prototype.customNested;
  });

  describe("utils.merge", () => {
    it("should filter __proto__ key at top level", () => {
      const result = utils.merge(
        {},
        { __proto__: { polluted: "yes" }, safe: "value" },
      );

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.safe, "value");
      assert.strictEqual(result.hasOwnProperty("__proto__"), false);
    });

    it("should filter constructor key at top level", () => {
      const result = utils.merge(
        {},
        { constructor: { polluted: "yes" }, safe: "value" },
      );

      assert.strictEqual(result.safe, "value");
      assert.strictEqual(result.hasOwnProperty("constructor"), false);
    });

    it("should filter prototype key at top level", () => {
      const result = utils.merge(
        {},
        { prototype: { polluted: "yes" }, safe: "value" },
      );

      assert.strictEqual(result.safe, "value");
      assert.strictEqual(result.hasOwnProperty("prototype"), false);
    });

    it("should filter __proto__ key in nested objects", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = utils.merge(
        {},
        {
          headers: {
            __proto__: { polluted: "nested" },
            "Content-Type": "application/json",
          },
        },
      );

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.headers["Content-Type"], "application/json");
      assert.strictEqual(result.headers.hasOwnProperty("__proto__"), false);
    });

    it("should filter constructor key in nested objects", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = utils.merge(
        {},
        {
          headers: {
            constructor: { prototype: { polluted: "nested" } },
            "Content-Type": "application/json",
          },
        },
      );

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.headers["Content-Type"], "application/json");
      assert.strictEqual(result.headers.hasOwnProperty("constructor"), false);
    });

    it("should filter prototype key in nested objects", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = utils.merge(
        {},
        {
          headers: {
            prototype: { polluted: "nested" },
            "Content-Type": "application/json",
          },
        },
      );

      assert.strictEqual(result.headers["Content-Type"], "application/json");
      assert.strictEqual(result.headers.hasOwnProperty("prototype"), false);
    });

    it("should filter dangerous keys in deeply nested objects", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = utils.merge(
        {},
        {
          level1: {
            level2: {
              __proto__: { polluted: "deep" },
              prototype: { polluted: "deep" },
              safe: "value",
            },
          },
        },
      );

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.level1.level2.safe, "value");
      assert.strictEqual(
        result.level1.level2.hasOwnProperty("__proto__"),
        false,
      );
    });

    it("should still merge regular properties correctly", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = utils.merge({ a: 1, b: { c: 2 } }, { b: { d: 3 }, e: 4 });

      assert.strictEqual(result.a, 1);
      assert.strictEqual(result.b.c, 2);
      assert.strictEqual(result.b.d, 3);
      assert.strictEqual(result.e, 4);
    });

    it("should handle JSON.parse payloads safely", () => {
      const malicious = JSON.parse('{"__proto__": {"polluted": "yes"}}');
      const result = utils.merge({}, malicious);

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.hasOwnProperty("__proto__"), false);
    });

    it("should handle nested JSON.parse payloads safely", () => {
      const malicious = JSON.parse(
        '{"headers": {"constructor": {"prototype": {"polluted": "yes"}}}}',
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = utils.merge({}, malicious);

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.headers.hasOwnProperty("constructor"), false);
    });
  });

  describe("mergeConfig", () => {
    it("should filter dangerous keys at top level", () => {
      const result = mergeConfig(
        {},
        {
          __proto__: { polluted: "yes" },
          constructor: { polluted: "yes" },
          prototype: { polluted: "yes" },
          url: "/api/test",
        },
      );

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.url, "/api/test");
      assert.strictEqual(result.hasOwnProperty("__proto__"), false);
      assert.strictEqual(result.hasOwnProperty("constructor"), false);
      assert.strictEqual(result.hasOwnProperty("prototype"), false);
    });

    it("should filter dangerous keys in headers", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = mergeConfig(
        {},
        {
          headers: {
            __proto__: { polluted: "yes" },
            "Content-Type": "application/json",
          },
        },
      );

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.headers["Content-Type"], "application/json");
      assert.strictEqual(result.headers.hasOwnProperty("__proto__"), false);
    });

    it("should filter dangerous keys in custom config properties", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = mergeConfig(
        {},
        {
          customProp: {
            __proto__: { polluted: "yes" },
            safe: "value",
          },
        },
      );

      assert.strictEqual(Object.prototype.polluted, undefined);
      assert.strictEqual(result.customProp.safe, "value");
      assert.strictEqual(result.customProp.hasOwnProperty("__proto__"), false);
    });

    it("should still merge configs correctly", () => {
      const config1 = {
        baseURL: "https://api.example.com",
        timeout: 1000,
        headers: {
          common: {
            Accept: "application/json",
          },
        },
      };

      const config2 = {
        url: "/users",
        timeout: 5000,
        headers: {
          common: {
            "Content-Type": "application/json",
          },
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = mergeConfig(config1, config2);

      assert.strictEqual(result.baseURL, "https://api.example.com");
      assert.strictEqual(result.url, "/users");
      assert.strictEqual(result.timeout, 5000);
      assert.strictEqual(result.headers.common.Accept, "application/json");
      assert.strictEqual(
        result.headers.common["Content-Type"],
        "application/json",
      );
    });

    // Polluted transformRequest/Response must not
    // replace the safe defaults through inherited reads during merge.
    it("should not inherit polluted transformRequest from Object.prototype", () => {
      const polluted = () => "attacker";
      ObjProto.transformRequest = polluted;

      const result = mergeConfig(
        { transformRequest: [(d) => d] },
        { url: "/x" },
      );

      assert.notStrictEqual(result.transformRequest, polluted);
      assert.ok(Array.isArray(result.transformRequest));
    });

    it("should not inherit polluted transformResponse from Object.prototype", () => {
      const polluted = () => "attacker";
      ObjProto.transformResponse = polluted;

      const result = mergeConfig(
        { transformResponse: [(d) => d] },
        { url: "/x" },
      );

      assert.notStrictEqual(result.transformResponse, polluted);
      assert.ok(Array.isArray(result.transformResponse));
    });
  });

  // parseReviver read via prototype chain.
  describe("defaults.transformResponse parseReviver", () => {
    it("should ignore Object.prototype.parseReviver when parsing JSON", () => {
      let reviverCalled = false;
      ObjProto.parseReviver = function polluted(k: unknown, v: unknown) {
        reviverCalled = true;
        if (k === "role") return "admin";
        return v;
      };

      const ctx = { transitional: defaults.transitional };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformFn = (defaults.transformResponse as any[])[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = transformFn.call(ctx, '{"role":"user","balance":100}');

      assert.strictEqual(reviverCalled, false);
      assert.strictEqual(result.role, "user");
      assert.strictEqual(result.balance, 100);
    });

    it("should ignore Object.prototype.responseType", () => {
      ObjProto.responseType = "json";
      const ctx = { transitional: defaults.transitional };
      // Non-JSON string body must be returned as-is; polluted responseType must
      // not force strict JSON parsing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (defaults.transformResponse as any[])[0].call(ctx, "plain text");
      assert.strictEqual(result, "plain text");
      delete ObjProto.responseType;
    });
  });

  // mergeDirectKeys must not inherit validateStatus from
  // Object.prototype (was using the `in` operator which traverses the chain).
  describe("validateStatus merge", () => {
    it("should not inherit a polluted validateStatus during mergeConfig", () => {
      ObjProto.validateStatus = () => true;

      const merged = mergeConfig(defaults, { url: "/x" });

      assert.strictEqual(merged.validateStatus, defaults.validateStatus);
    });

    it("should keep 4xx/5xx responses rejected when Object.prototype.validateStatus is polluted", async () => {
      ObjProto.validateStatus = () => true;

      const server = http.createServer((_req, res) => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end('{"error":"unauthorized"}');
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const { port } = (server.address() as AddressInfo);

      try {
        let threw = false;
        try {
          await ax.get(`http://127.0.0.1:${port}/`);
        } catch (err) {
          threw = true;
          assert.strictEqual((err as { response: { status: number } }).response.status, 401);
        }
        assert.strictEqual(threw, true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }, 10000);
  });

  // end-to-end check that a polluted parseReviver does not
  // tamper with JSON response bodies through the full axios.get pipeline.
  describe("parseReviver end-to-end", () => {
    it("should not let Object.prototype.parseReviver tamper with JSON responses", async () => {
      let reviverCalled = false;
      const stolen: Record<string, unknown> = {};
      ObjProto.parseReviver = function polluted(key: string, value: unknown) {
        reviverCalled = true;
        if (key && typeof value !== "object") stolen[key] = value;
        if (key === "isAdmin") return true;
        if (key === "role") return "admin";
        if (key === "balance") return 999999;
        return value;
      };

      const payload = {
        user: "john",
        role: "viewer",
        isAdmin: false,
        balance: 100,
        apiKey: "sk-secret-internal-key",
      };

      const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const { port } = (server.address() as AddressInfo);

      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);

        assert.strictEqual(reviverCalled, false);
        assert.deepStrictEqual(res.data, payload);
        assert.deepStrictEqual(stolen, {});
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }, 10000);
  });

  // http adapter must not read config.transport
  // (or related keys) from Object.prototype.
  describe("http adapter prototype reads", () => {
    it("should not invoke Object.prototype.transport on a request", async () => {
      let hijackCalled = false;
      ObjProto.transport = {
        request(options: http.RequestOptions, handleResponse: (res: http.IncomingMessage) => void) {
          hijackCalled = true;
          return http.request(options, handleResponse);
        },
      };

      const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const { port } = (server.address() as AddressInfo);

      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.data.ok, true);
        assert.strictEqual(hijackCalled, false);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }, 10000);
  });

  // Five config properties were read via direct property
  // access in the http adapter and resolveConfig, bypassing hasOwnProperty and
  // allowing prototype pollution gadgets (auth, baseURL, socketPath,
  // beforeRedirect, insecureHTTPParser).
  describe("http adapter gadgets", () => {
    async function startServer(handler?: http.RequestListener): Promise<ServerLike> {
      return new Promise((resolve) => {
        const server = http.createServer(
          handler ||
            ((req, res) => {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ headers: req.headers, url: req.url }));
            }),
        );
        server.listen(0, "127.0.0.1", () => resolve(server));
      });
    }

    async function stopServer(server: ServerLike): Promise<void> {
      return new Promise((resolve) => server.close(() => resolve()));
    }

    it("should not pick up Object.prototype.auth as an Authorization header", async () => {
      ObjProto.auth = { username: "attacker", password: "exfil" };

      const server = await startServer();
      const { port } = (server.address() as AddressInfo);

      try {
        const res = await ax.get(`http://127.0.0.1:${port}/api`);
        assert.strictEqual(res.data.headers.authorization, undefined);
      } finally {
        await stopServer(server);
      }
    }, 10000);

    it("should not pick up Object.prototype.socketPath and redirect the request", async () => {
      ObjProto.socketPath = "/tmp/axios-should-never-be-used.sock";

      const server = await startServer();
      const { port } = (server.address() as AddressInfo);

      try {
        const res = await ax.get(`http://127.0.0.1:${port}/api`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.url, "/api");
      } finally {
        await stopServer(server);
      }
    }, 10000);

    it("should not invoke Object.prototype.beforeRedirect during redirects", async () => {
      let hijackCalled = false;
      ObjProto.beforeRedirect = function polluted() {
        hijackCalled = true;
      };

      const target = await startServer();
      const { port: targetPort } = (target.address() as AddressInfo);

      const redirector = await startServer((_req, res) => {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${targetPort}/final`,
        });
        res.end();
      });
      const { port: redirectorPort } = (redirector.address() as AddressInfo);

      try {
        const res = await ax.get(`http://127.0.0.1:${redirectorPort}/start`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(hijackCalled, false);
      } finally {
        await stopServer(redirector);
        await stopServer(target);
      }
    }, 10000);

    it("should not pick up Object.prototype.sensitiveHeaders during redirects", async () => {
      ObjProto.sensitiveHeaders = ["X-Secret"];
      let capturedHeaders: http.IncomingHttpHeaders | undefined;

      const target = await startServer((req, res) => {
        capturedHeaders = req.headers;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
      const { port: targetPort } = (target.address() as AddressInfo);

      const redirector = await startServer((_req, res) => {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${targetPort}/final`,
        });
        res.end();
      });
      const { port: redirectorPort } = (redirector.address() as AddressInfo);

      try {
        await ax.get(`http://127.0.0.1:${redirectorPort}/start`, {
          headers: { "X-Secret": "keep" },
        });
        assert.strictEqual(capturedHeaders!["x-secret"], "keep");
      } finally {
        await stopServer(redirector);
        await stopServer(target);
      }
    }, 10000);

    it("should not enable insecureHTTPParser via Object.prototype", async () => {
      // A raw TCP server emits a response that uses LF-only line terminators
      // instead of CRLF. Node's strict HTTP parser rejects this payload with
      // HPE_CR_EXPECTED; the insecure parser accepts it. Verified: with an
      // explicit `insecureHTTPParser: true` on the request config, this
      // payload is parsed successfully — so if Object.prototype.insecureHTTPParser
      // were picked up, the request would succeed. The request must fail when
      // the gadget is properly blocked.
      ObjProto.insecureHTTPParser = true;

      const net = await import("node:net");
      const malformedPayload =
        "HTTP/1.1 200 OK\n" +
        "Content-Type: application/json\n" +
        "Content-Length: 2\n" +
        "\n" +
        "{}";
      const malformed = await new Promise<import("node:net").Server>((resolve) => {
        const srv = net.createServer((socket) => {
          socket.once("data", () => socket.end(malformedPayload));
        });
        srv.listen(0, "127.0.0.1", () => resolve(srv));
      });
      const { port } = (malformed.address() as AddressInfo);

      try {
        let threw = false;
        let caughtCode = "";
        try {
          await ax.get(`http://127.0.0.1:${port}/`, {
            transitional: { clarifyTimeoutError: false },
          });
        } catch (err) {
          threw = true;
          caughtCode = String(err && ((err as NodeJS.ErrnoException).code || (err as Error).message));
        }
        assert.strictEqual(
          threw,
          true,
          `request should be rejected by the strict HTTP parser (got: ${caughtCode || "success"})`,
        );
        // The exact llhttp code for LF-only line terminators varies across
        // Node versions (historically HPE_LF_EXPECTED, more recently
        // HPE_CR_EXPECTED). Match any parser error to remain stable across
        // Node releases while still confirming the strict parser rejected
        // the payload.
        assert.match(
          caughtCode,
          /^HPE_/,
          `expected an HPE_* parser error, got: ${caughtCode}`,
        );
      } finally {
        await new Promise<void>((resolve) => malformed.close(() => resolve()));
      }
    }, 10000);

    it("should not inject Proxy-Authorization from polluted Object.prototype.auth", async () => {
      // setProxy reads `proxy.auth` directly. When `proxy` is a
      // URL instance from the environment proxy or a plain object without an own `auth`,
      // a polluted Object.prototype.auth would otherwise be base64-encoded into the
      // Proxy-Authorization header, leaking attacker-controlled credentials.
      ObjProto.auth = { username: "attacker", password: "exfil" };

      const proxy = await startServer();
      const { port: proxyPort } = (proxy.address() as AddressInfo);

      const target = await startServer();
      const { port: targetPort } = (target.address() as AddressInfo);

      try {
        const res = await ax.get(`http://127.0.0.1:${targetPort}/api`, {
          proxy: { host: "127.0.0.1", port: proxyPort, protocol: "http" },
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(
          res.data.headers["proxy-authorization"],
          undefined,
          "polluted Object.prototype.auth must not produce a Proxy-Authorization header",
        );
      } finally {
        await stopServer(target);
        await stopServer(proxy);
      }
    }, 10000);

    it("should not inject Proxy-Authorization from polluted Object.prototype.username", async () => {
      // The setProxy username/password branch builds basic creds from `proxy.username`
      // and `proxy.password`. For a plain object proxy, both reads must be guarded
      // against prototype pollution.
      ObjProto.username = "attacker";
      ObjProto.password = "exfil";

      const proxy = await startServer();
      const { port: proxyPort } = (proxy.address() as AddressInfo);

      const target = await startServer();
      const { port: targetPort } = (target.address() as AddressInfo);

      try {
        const res = await ax.get(`http://127.0.0.1:${targetPort}/api`, {
          proxy: { host: "127.0.0.1", port: proxyPort, protocol: "http" },
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(
          res.data.headers["proxy-authorization"],
          undefined,
          "polluted Object.prototype.username must not produce a Proxy-Authorization header",
        );
      } finally {
        await stopServer(target);
        await stopServer(proxy);
      }
    }, 10000);
  });

  describe("resolveConfig baseURL gadget", () => {
    // The baseURL branch in buildFullPath only runs when the requested URL is
    // relative (or allowAbsoluteUrls === false). An absolute URL would skip
    // baseURL regardless of pollution and would not exercise the gadget. We
    // therefore issue a relative GET and assert that either:
    //   - the request fails (no host to resolve) because baseURL is correctly
    //     absent from the merged config, OR
    //   - the request is fulfilled without hitting the hijacker.
    // Critically, hijackHit must always be false.
    it("should not hijack relative-URL requests via Object.prototype.baseURL", async () => {
      let hijackHit = false;
      const hijacker = http.createServer((_req, res) => {
        hijackHit = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"hijacked":true}');
      });
      await new Promise<void>((resolve) => hijacker.listen(0, "127.0.0.1", () => resolve()));
      const { port: hijackerPort } = (hijacker.address() as AddressInfo);

      ObjProto.baseURL = `http://127.0.0.1:${hijackerPort}`;

      try {
        let threw = false;
        try {
          await ax.get("/api");
        } catch (_err) {
          threw = true;
        }
        // Either the request fails (desired — no baseURL means no host) or it
        // resolves, but it must NOT hit the polluted hijacker.
        assert.strictEqual(hijackHit, false);
        assert.strictEqual(threw, true);
      } finally {
        await new Promise<void>((resolve) => hijacker.close(() => resolve()));
      }
    }, 10000);

    // Second variant using allowAbsoluteUrls: false to force the baseURL path
    // even for a fully-qualified requested URL.
    it("should not hijack requests via Object.prototype.baseURL with allowAbsoluteUrls:false", async () => {
      let hijackHit = false;
      const hijacker = http.createServer((_req, res) => {
        hijackHit = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"hijacked":true}');
      });
      await new Promise<void>((resolve) => hijacker.listen(0, "127.0.0.1", () => resolve()));
      const { port: hijackerPort } = (hijacker.address() as AddressInfo);

      const target = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
      await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", () => resolve()));
      const { port: targetPort } = (target.address() as AddressInfo);

      ObjProto.baseURL = `http://127.0.0.1:${hijackerPort}`;

      try {
        // If the gadget were picked up, combineURLs(hijacker, `http://target`)
        // would route to the hijacker. It must not.
        let threw = false;
        try {
          await ax.get(`http://127.0.0.1:${targetPort}/api`, {
            allowAbsoluteUrls: false,
          });
        } catch (_err) {
          threw = true;
        }
        assert.strictEqual(hijackHit, false);
        // allowAbsoluteUrls:false + no baseURL → combineURLs not invoked
        // (baseURL falsy) → returns requested URL as-is → target receives it.
        // If baseURL were inherited from prototype, it would be truthy and
        // combineURLs would be invoked, routing to the hijacker.
        assert.strictEqual(threw, false);
      } finally {
        await new Promise<void>((resolve) => hijacker.close(() => resolve()));
        await new Promise<void>((resolve) => target.close(() => resolve()));
      }
    }, 10000);
  });

  describe("resolveConfig params and paramsSerializer gadget", () => {
    it("should not inherit polluted params via resolveConfig", () => {
      ObjProto.params = { injected: "yes" };

      try {
        const resolved = resolveConfig({ url: "/api", method: "get" });

        assert.ok(
          resolved.url!.indexOf("injected") === -1,
          "polluted params must not appear in URL",
        );
        assert.strictEqual(resolved.url, "/api", "URL must remain unchanged");
      } finally {
        delete ObjProto.params;
      }
    });

    it("should not invoke polluted paramsSerializer via resolveConfig", () => {
      let serializerInvoked = false;
      ObjProto.paramsSerializer = function polluted() {
        serializerInvoked = true;
        return "injected=yes";
      };

      try {
        const resolved = resolveConfig({
          url: "/api",
          method: "get",
          params: { legit: "true" },
        });

        assert.strictEqual(
          serializerInvoked,
          false,
          "polluted paramsSerializer must not be called",
        );
        // The URL should have legit param serialized normally
        assert.ok(
          resolved.url!.indexOf("legit=true") !== -1,
          "legitimate params must still be serialized",
        );
      } finally {
        delete ObjProto.paramsSerializer;
      }
    });
  });

  // Structural defense: mergeConfig returns a null-prototype object, so any
  // property read that is not an own property of config cannot inherit from
  // Object.prototype. Adding a new key to Object.prototype must never appear
  // as a property of the merged config.
  describe("mergeConfig null-prototype structural defense", () => {
    it("should return an object whose prototype is null", () => {
      const merged = mergeConfig({ url: "/x" }, { method: "get" });
      assert.strictEqual(Object.getPrototypeOf(merged), null);
    });

    it("should preserve hasOwnProperty as a callable own slot", () => {
      const merged = mergeConfig({}, { url: "/x", method: "get" });
      assert.strictEqual(typeof merged.hasOwnProperty, "function");
      assert.strictEqual(merged.hasOwnProperty("url"), true);
      assert.strictEqual(merged.hasOwnProperty("method"), true);
      assert.strictEqual(merged.hasOwnProperty("bogus"), false);
    });

    it("should not serialize hasOwnProperty slot via Object.keys", () => {
      const merged = mergeConfig({ url: "/x" }, {});
      assert.ok(!Object.keys(merged).includes("hasOwnProperty"));
    });

    it("should not expose arbitrary polluted keys as inherited properties", () => {
      Object.prototype.polluted = "attacker";
      try {
        const merged = mergeConfig({ url: "/x" }, {});
        assert.strictEqual(merged.polluted, undefined);
      } finally {
        delete Object.prototype.polluted;
      }
    });
  });

  // Verify every gadget enumerated in the audit
  // is neutralized end-to-end by the null-prototype config.
  describe("Full gadget coverage via null-prototype config", () => {
    async function startEcho(handler?: http.RequestListener): Promise<ServerLike> {
      return new Promise((resolve) => {
        const server = http.createServer(
          handler ||
            ((req, res) => {
              let body = "";
              req.on("data", (c: Buffer) => (body += c));
              req.on("end", () => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    url: req.url,
                    method: req.method,
                    headers: req.headers,
                    body,
                  }),
                );
              });
            }),
        );
        server.listen(0, "127.0.0.1", () => resolve(server));
      });
    }
    const stop = async (s: ServerLike): Promise<void> => new Promise((r) => s.close(() => r()));

    it("should ignore polluted transformRequest", async () => {
      let invoked = false;
      ObjProto.transformRequest = function polluted(_data: unknown) {
        invoked = true;
        return "INJECTED";
      };

      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.post(`http://127.0.0.1:${port}/`, {
          hello: "world",
        });
        assert.strictEqual(invoked, false);
        assert.notStrictEqual(res.data.body, "INJECTED");
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted transformResponse", async () => {
      let invoked = false;
      ObjProto.transformResponse = function polluted() {
        invoked = true;
        return "HIJACKED";
      };

      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(invoked, false);
        assert.notStrictEqual(res.data, "HIJACKED");
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted adapter", async () => {
      let hijacked = false;
      ObjProto.adapter = async function pollutedAdapter() {
        hijacked = true;
        return Promise.resolve({
          data: "pwned",
          status: 200,
          statusText: "OK",
          headers: {},
          config: {},
          request: {},
        });
      };

      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/ok`);
        assert.strictEqual(hijacked, false);
        assert.notStrictEqual(res.data, "pwned");
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted httpAgent", async () => {
      let agentUsed = false;
      ObjProto.httpAgent = new http.Agent({
        keepAlive: false,
      });
      // Wrap createConnection to detect usage
      const origCreate = (ObjProto.httpAgent as http.Agent).createConnection;
      ObjProto.httpAgent.createConnection = function (...args: unknown[]) {
        agentUsed = true;
        return origCreate.apply(this, args as Parameters<typeof origCreate>);
      };

      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(agentUsed, false);
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted proxy", async () => {
      ObjProto.proxy = {
        protocol: "http",
        host: "127.0.0.1",
        port: 1, // would fail if actually used
      };

      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted maxContentLength", async () => {
      // Polluted tiny limit would reject a normal response if applied.
      ObjProto.maxContentLength = 1;

      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted maxRedirects", async () => {
      // Pollute with 0 — if picked up, follow-redirects path would be skipped.
      // We make sure regular requests still succeed via the expected path.
      ObjProto.maxRedirects = 0;

      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted timeout at the merged config level", () => {
      ObjProto.timeout = 1;
      const merged = mergeConfig({}, { url: "/x" });
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(merged, "timeout"),
        false,
      );
      assert.strictEqual(merged.timeout, undefined);
    });

    it("should ignore polluted timeoutErrorMessage", async () => {
      ObjProto.timeoutErrorMessage = "INJECTED_TIMEOUT";
      // Not easy to assert without triggering a real timeout; just confirm
      // normal requests still succeed and do not read the polluted key.
      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted transitional", async () => {
      ObjProto.transitional = {
        forcedJSONParsing: true,
        silentJSONParsing: false,
      };
      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted params and paramsSerializer", async () => {
      let serializerInvoked = false;
      ObjProto.params = { injected: "yes" };
      ObjProto.paramsSerializer = function polluted() {
        serializerInvoked = true;
        return "injected=yes";
      };

      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/x`);
        assert.strictEqual(serializerInvoked, false);
        assert.strictEqual(res.data.url, "/x");
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted method", async () => {
      ObjProto.method = "DELETE";
      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        // axios.get should still send GET, not DELETE.
        const res = await ax.get(`http://127.0.0.1:${port}/ok`);
        assert.strictEqual(res.data.method, "GET");
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted decompress", async () => {
      ObjProto.decompress = false;
      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      } finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted responseType", async () => {
      ObjProto.responseType = "arraybuffer";
      const server = await startEcho();
      const { port } = (server.address() as AddressInfo);
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        // When responseType is not set on config, json parsing should apply
        // and res.data should be an object, not an ArrayBuffer/Buffer.
        assert.strictEqual(typeof res.data, "object");
        assert.ok(!Buffer.isBuffer(res.data));
      } finally {
        await stop(server);
      }
    }, 10000);
  });

  // utils.merge previously read `result[targetKey]` directly, which walks the
  // prototype chain. A polluted Object.prototype.<key> object would surface as
  // the existing value and be merged into the result.
  describe("utils.merge prototype-chain read", () => {
    it("should not pick up polluted Object.prototype.<key> as the existing value", () => {
      ObjProto.headers = { evil: "yes" };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = utils.merge(
        {},
        { headers: { "Content-Type": "application/json" } },
      );

      assert.strictEqual(result.headers.evil, undefined);
      assert.strictEqual(result.headers["Content-Type"], "application/json");
    });

    it("should not absorb polluted nested objects when the key is absent from inputs", () => {
      // When the source does not carry `customNested`, the merged result should
      // not surface it either, even if Object.prototype carries it.
      Object.prototype.customNested = { evil: "yes" };

      const result = utils.merge({}, { safe: "value" });

      assert.strictEqual(result.hasOwnProperty("customNested"), false);
      assert.strictEqual(result.safe, "value");
    });
  });

  // Object.defineProperty calls a HasProperty check on `get`/`set` of the
  // descriptor. A polluted Object.prototype.get with a non-function value would
  // throw TypeError at every defineProperty site that uses a plain literal
  // descriptor. Each fixed site should be shielded with `__proto__: null`.
  describe("Object.defineProperty descriptor literals", () => {
    it("should construct AxiosError when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      const err = new AxiosError("hello", "ECODE");

      assert.strictEqual(err.message, "hello");
      assert.strictEqual(err.code, "ECODE");
    });

    it("should construct AxiosHeaders accessor methods when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      // AxiosHeaders.accessor uses Object.defineProperty on the prototype.
      // Triggering a fresh accessor definition exercises the descriptor literal.
      AxiosHeaders.accessor("X-Pp-Test");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const h = new AxiosHeaders() as any;
      h.setXPpTest("value");
      assert.strictEqual(h.getXPpTest(), "value");
    });

    it("should not throw in mergeConfig when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      const result = mergeConfig({}, { url: "/x", method: "get" });

      assert.strictEqual(result.url, "/x");
      assert.strictEqual(result.method, "get");
      assert.strictEqual(typeof result.hasOwnProperty, "function");
    });

    it("should not throw in utils.extend when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      const a: Record<string, unknown> = {};
      const b = { x: 1, fn() {} };
      utils.extend(a, b, undefined);

      assert.strictEqual(a.x, 1);
      assert.strictEqual(typeof a.fn, "function");
    });

    it("should not throw in utils.extend with thisArg when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      const a: Record<string, unknown> = {};
      const ctx = { tag: "ctx" };
      const b = {
        method(this: { tag: string }) {
          return this.tag;
        },
      };
      utils.extend(a, b, ctx);

      assert.strictEqual((a.method as () => string)(), "ctx");
    });

    it("should not throw in utils.inherits when Object.prototype.get is polluted", () => {
      ObjProto.get = "attacker";

      function Parent() {}
      function Child() {}
      utils.inherits(Child, Parent);

      assert.strictEqual(Child.prototype.constructor, Child);
      assert.strictEqual((Child as unknown as { super: unknown }).super, Parent.prototype);
    });

    it("should also be shielded against a polluted Object.prototype.set", () => {
      ObjProto.set = "attacker";

      // Same surface as `get` — ToPropertyDescriptor checks both. One spot-check
      // covers them all since they share the same fix.
      const err = new AxiosError("hello");
      assert.strictEqual(err.message, "hello");
    });
  });

  // End-to-end regressions covering published advisory PoCs against full axios
  // request flow. Each test mirrors the exploit scenario from the advisory and
  // asserts the attack does not succeed.
  describe("advisory regression — full request flow", () => {
    async function startServer(handler: http.RequestListener): Promise<ServerLike> {
      return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, "127.0.0.1", () => resolve(server));
      });
    }
    const stop = async (s: ServerLike): Promise<void> => new Promise((r) => s.close(() => r()));

    // Full MITM via prototype pollution gadget in
    // `config.proxy`. mergeConfig must not surface a polluted Object.prototype.proxy
    // as the merged config's proxy, otherwise every request would route through
    // an attacker-controlled host.
    it("polluted Object.prototype.proxy must not redirect requests through an attacker proxy", async () => {
      const proxyHits = [];
      const attackerProxy = await startServer((req, res) => {
        proxyHits.push({
          url: req.url,
          authorization: req.headers.authorization,
          host: req.headers.host,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"hijacked":true}');
      });

      const realHits = [];
      const realServer = await startServer((req, res) => {
        realHits.push({ url: req.url });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"data":"real"}');
      });

      try {
        ObjProto.proxy = {
          protocol: "http",
          host: "127.0.0.1",
          port: (attackerProxy.address() as AddressInfo).port,
        };

        const realPort = (realServer.address() as AddressInfo).port;
        const res = await ax.get(
          `http://127.0.0.1:${realPort}/api/secrets`,
          {
            auth: { username: "admin", password: "SuperSecret123!" },
          },
        );

        assert.strictEqual(
          proxyHits.length,
          0,
          "attacker proxy must not receive any request",
        );
        assert.strictEqual(
          realHits.length,
          1,
          "request must reach the real target",
        );
        assert.deepStrictEqual(res.data, { data: "real" });
      } finally {
        await stop(attackerProxy);
        await stop(realServer);
      }
    }, 10000);

    // Credential theft and response hijacking via
    // prototype pollution gadget in config merge. A polluted
    // Object.prototype.transformResponse function would otherwise execute with
    // `this = config`, exposing `auth.username`/`auth.password` to the attacker.
    it("polluted Object.prototype.transformResponse must not be invoked or leak request credentials", async () => {
      let invoked = false;
      let stolen = null;
      ObjProto.transformResponse = function pollutedTransform(data: unknown) {
        invoked = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = this as any;
        stolen = {
          url: ctx && ctx.url,
          username: ctx && ctx.auth && ctx.auth.username,
          password: ctx && ctx.auth && ctx.auth.password,
          data,
        };
        return true;
      };

      const server = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"secret":"keep-me"}');
      });

      try {
        const { port } = (server.address() as AddressInfo);
        const res = await ax.get(`http://127.0.0.1:${port}/users`, {
          auth: { username: "svc-account", password: "prod-secret-key-123!" },
        });

        assert.strictEqual(
          invoked,
          false,
          "polluted transformResponse must not run",
        );
        assert.strictEqual(stolen, null, "no request context must be captured");
        assert.deepStrictEqual(
          res.data,
          { secret: "keep-me" },
          "response data must reach the caller untampered",
        );
      } finally {
        await stop(server);
      }
    }, 10000);
  });
});
