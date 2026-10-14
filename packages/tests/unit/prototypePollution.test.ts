/* eslint-disable no-prototype-builtins */
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, vi } from "vitest";
import faxios from "#src/index.ts";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { retry } from "#src/lib/plugins/retry.ts";
import { timing } from "#src/lib/plugins/timing.ts";
import { ObjProto, restorePrototypeAfterEach } from "../setup/pollution.js";
import { startHTTPServer, stopHTTPServer } from "../setup/server.js";
import type { ExtendedServer } from "../setup/server.js";

type ServerLike = ExtendedServer;

// ponytail: cast for test ergonomics — faxios.get returns Promise<unknown> in this codebase

const ax = faxios as any;

describe("Prototype Pollution Protection", () => {
  restorePrototypeAfterEach();

  // mergeDirectKeys must not inherit validateStatus from
  // Object.prototype (was using the `in` operator which traverses the chain).
  describe("validateStatus merge", () => {
    it("should keep 4xx/5xx responses rejected when Object.prototype.validateStatus is polluted", async () => {
      ObjProto.validateStatus = () => true;

      const server = await startHTTPServer((_req, res) => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end("{\"error\":\"unauthorized\"}");
      });
      const { port } = server.address() as AddressInfo;

      try {
        let threw = false;
        try {
          await ax.get(`http://127.0.0.1:${port}/`);
        }
        catch (err) {
          threw = true;
          assert.strictEqual(
            (err as { response: { status: number; }; }).response.status,
            401
          );
        }
        assert.strictEqual(threw, true);
      }
      finally {
        await stopHTTPServer(server);
      }
    }, 10000);
  });

  // end-to-end check that a polluted parseReviver does not
  // tamper with JSON response bodies through the full faxios.get pipeline.
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

      const server = await startHTTPServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      });
      const { port } = server.address() as AddressInfo;

      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);

        assert.strictEqual(reviverCalled, false);
        assert.deepStrictEqual(res.data, payload);
        assert.deepStrictEqual(stolen, {});
      }
      finally {
        await stopHTTPServer(server);
      }
    }, 10000);
  });

  // http adapter must not read config.transport
  // (or related keys) from Object.prototype.
  describe("http adapter prototype reads", () => {
    it("should not invoke Object.prototype.transport on a request", async () => {
      let hijackCalled = false;
      ObjProto.transport = {
        request(
          options: http.RequestOptions,
          handleResponse: (res: http.IncomingMessage) => void
        ) {
          hijackCalled = true;
          return http.request(options, handleResponse);
        },
      };

      const server = await startHTTPServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{\"ok\":true}");
      });
      const { port } = server.address() as AddressInfo;

      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.data.ok, true);
        assert.strictEqual(hijackCalled, false);
      }
      finally {
        await stopHTTPServer(server);
      }
    }, 10000);
  });

  // Five config properties were read via direct property
  // access in the http adapter and prepareRequest, bypassing hasOwnProperty and
  // allowing prototype pollution gadgets (auth, baseURL, socketPath,
  // beforeRedirect, insecureHTTPParser).
  describe("http adapter gadgets", () => {
    async function startServer(
      handler?: http.RequestListener
    ): Promise<ServerLike> {
      return startHTTPServer(
        handler ||
          ((req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ headers: req.headers, url: req.url }));
          })
      );
    }

    const stopServer = stopHTTPServer;

    it("should not pick up Object.prototype.auth as an Authorization header", async () => {
      ObjProto.auth = { username: "attacker", password: "exfil" };

      const server = await startServer();
      const { port } = server.address() as AddressInfo;

      try {
        const res = await ax.get(`http://127.0.0.1:${port}/api`);
        assert.strictEqual(res.data.headers.authorization, undefined);
      }
      finally {
        await stopServer(server);
      }
    }, 10000);

    it("should not invoke Object.prototype.beforeRedirect during redirects", async () => {
      let hijackCalled = false;
      ObjProto.beforeRedirect = function polluted() {
        hijackCalled = true;
      };

      const target = await startServer();
      const { port: targetPort } = target.address() as AddressInfo;

      const redirector = await startServer((_req, res) => {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${targetPort}/final`,
        });
        res.end();
      });
      const { port: redirectorPort } = redirector.address() as AddressInfo;

      try {
        const res = await ax.get(`http://127.0.0.1:${redirectorPort}/start`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(hijackCalled, false);
      }
      finally {
        await stopServer(redirector);
        await stopServer(target);
      }
    }, 10000);

    it("should not pick up Object.prototype.sensitiveHeaders during redirects", async () => {
      ObjProto.sensitiveHeaders = [ "X-Secret" ];
      let capturedHeaders: http.IncomingHttpHeaders | undefined;

      const target = await startServer((req, res) => {
        capturedHeaders = req.headers;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{\"ok\":true}");
      });
      const { port: targetPort } = target.address() as AddressInfo;

      const redirector = await startServer((_req, res) => {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${targetPort}/final`,
        });
        res.end();
      });
      const { port: redirectorPort } = redirector.address() as AddressInfo;

      try {
        await ax.get(`http://127.0.0.1:${redirectorPort}/start`, {
          headers: { "X-Secret": "keep" },
        });
        assert.strictEqual(capturedHeaders!["x-secret"], "keep");
      }
      finally {
        await stopServer(redirector);
        await stopServer(target);
      }
    }, 10000);
  });

  describe("prepareRequest baseURL gadget", () => {
    // The baseURL branch in buildFullPath only runs when the requested URL is
    // relative (with allowAbsoluteUrls === false an absolute URL throws). An absolute URL would skip
    // baseURL regardless of pollution and would not exercise the gadget. We
    // therefore issue a relative GET and assert that either:
    //   - the request fails (no host to resolve) because baseURL is correctly
    //     absent from the merged config, OR
    //   - the request is fulfilled without hitting the hijacker.
    // Critically, hijackHit must always be false.
    it("should not hijack relative-URL requests via Object.prototype.baseURL", async () => {
      let hijackHit = false;
      const hijacker = await startHTTPServer((_req, res) => {
        hijackHit = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{\"hijacked\":true}");
      });
      const { port: hijackerPort } = hijacker.address() as AddressInfo;

      ObjProto.baseURL = `http://127.0.0.1:${hijackerPort}`;

      try {
        let threw = false;
        try {
          await ax.get("/api");
        }
        catch (_err) {
          threw = true;
        }
        // Either the request fails (desired — no baseURL means no host) or it
        // resolves, but it must NOT hit the polluted hijacker.
        assert.strictEqual(hijackHit, false);
        assert.strictEqual(threw, true);
      }
      finally {
        await stopHTTPServer(hijacker);
      }
    }, 10000);

    // Second variant using allowAbsoluteUrls: false to force the baseURL path
    // even for a fully-qualified requested URL.
    it("should not hijack requests via Object.prototype.baseURL with allowAbsoluteUrls:false", async () => {
      let hijackHit = false;
      const hijacker = await startHTTPServer((_req, res) => {
        hijackHit = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{\"hijacked\":true}");
      });
      const { port: hijackerPort } = hijacker.address() as AddressInfo;

      const target = await startHTTPServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{\"ok\":true}");
      });
      const { port: targetPort } = target.address() as AddressInfo;

      ObjProto.baseURL = `http://127.0.0.1:${hijackerPort}`;

      try {
        // If the gadget were picked up, combineURLs(hijacker, `http://target`)
        // would route to the hijacker. It must not.
        let threw = false;
        try {
          await ax.get(`http://127.0.0.1:${targetPort}/api`, {
            allowAbsoluteUrls: false,
          });
        }
        catch (_err) {
          threw = true;
        }
        assert.strictEqual(hijackHit, false);
        // allowAbsoluteUrls:false + no baseURL → combineURLs not invoked
        // (baseURL falsy) → returns requested URL as-is → target receives it.
        // If baseURL were inherited from prototype, it would be truthy and
        // combineURLs would be invoked, routing to the hijacker.
        assert.strictEqual(threw, false);
      }
      finally {
        await stopHTTPServer(hijacker);
        await stopHTTPServer(target);
      }
    }, 10000);
  });

  // Verify every gadget enumerated in the audit
  // is neutralized end-to-end by the null-prototype config.
  describe("Full gadget coverage via null-prototype config", () => {
    async function startEcho(
      handler?: http.RequestListener
    ): Promise<ServerLike> {
      return startHTTPServer(
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
                  })
                );
              });
            })
      );
    }
    const stop = stopHTTPServer;

    it("should ignore polluted transformRequest", async () => {
      let invoked = false;
      ObjProto.transformRequest = function polluted(_data: unknown) {
        invoked = true;
        return "INJECTED";
      };

      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.post(`http://127.0.0.1:${port}/`, {
          hello: "world",
        });
        assert.strictEqual(invoked, false);
        assert.notStrictEqual(res.data.body, "INJECTED");
      }
      finally {
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
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(invoked, false);
        assert.notStrictEqual(res.data, "HIJACKED");
      }
      finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted httpAgent", async () => {
      let agentUsed = false;
      const agent = new http.Agent({
        keepAlive: false,
      });
      // Wrap createConnection to detect usage
      const origCreate = agent.createConnection;
      agent.createConnection = function (...args: Array<unknown>) {
        agentUsed = true;
        return origCreate.apply(this, args as Parameters<typeof origCreate>);
      };
      ObjProto.httpAgent = agent;

      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(agentUsed, false);
      }
      finally {
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
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      }
      finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted maxContentLength", async () => {
      // Polluted tiny limit would reject a normal response if applied.
      ObjProto.maxContentLength = 1;

      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      }
      finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted maxRedirects", async () => {
      // Pollute with 0 — if picked up, follow-redirects path would be skipped.
      // We make sure regular requests still succeed via the expected path.
      ObjProto.maxRedirects = 0;

      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      }
      finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted timeoutErrorMessage", async () => {
      ObjProto.timeoutErrorMessage = "INJECTED_TIMEOUT";
      // Not easy to assert without triggering a real timeout; just confirm
      // normal requests still succeed and do not read the polluted key.
      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      }
      finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted transitional", async () => {
      ObjProto.transitional = {
        forcedJSONParsing: false,
      };
      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      }
      finally {
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
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/x`);
        assert.strictEqual(serializerInvoked, false);
        assert.strictEqual(res.data.url, "/x");
      }
      finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted method", async () => {
      ObjProto.method = "DELETE";
      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        // faxios.get should still send GET, not DELETE.
        const res = await ax.get(`http://127.0.0.1:${port}/ok`);
        assert.strictEqual(res.data.method, "GET");
      }
      finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted decompress", async () => {
      ObjProto.decompress = false;
      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        assert.strictEqual(res.status, 200);
      }
      finally {
        await stop(server);
      }
    }, 10000);

    it("should ignore polluted responseType", async () => {
      ObjProto.responseType = "arraybuffer";
      const server = await startEcho();
      const { port } = server.address() as AddressInfo;
      try {
        const res = await ax.get(`http://127.0.0.1:${port}/`);
        // When responseType is not set on config, json parsing should apply
        // and res.data should be an object, not an ArrayBuffer/Buffer.
        assert.strictEqual(typeof res.data, "object");
        assert.ok(!Buffer.isBuffer(res.data));
      }
      finally {
        await stop(server);
      }
    }, 10000);
  });

  // End-to-end regressions covering published advisory PoCs against full faxios
  // request flow. Each test mirrors the exploit scenario from the advisory and
  // asserts the attack does not succeed.
  describe("advisory regression — full request flow", () => {
    async function startServer(
      handler: http.RequestListener
    ): Promise<ServerLike> {
      return startHTTPServer(handler);
    }
    const stop = stopHTTPServer;

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
        res.end("{\"hijacked\":true}");
      });

      const realHits = [];
      const realServer = await startServer((req, res) => {
        realHits.push({ url: req.url });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{\"data\":\"real\"}");
      });

      try {
        ObjProto.proxy = {
          protocol: "http",
          host: "127.0.0.1",
          port: (attackerProxy.address() as AddressInfo).port,
        };

        const realPort = (realServer.address() as AddressInfo).port;
        const res = await ax.get(`http://127.0.0.1:${realPort}/api/secrets`, {
          auth: { username: "admin", password: "SuperSecret123!" },
        });

        assert.strictEqual(
          proxyHits.length,
          0,
          "attacker proxy must not receive any request"
        );
        assert.strictEqual(
          realHits.length,
          1,
          "request must reach the real target"
        );
        assert.deepStrictEqual(res.data, { data: "real" });
      }
      finally {
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
      ObjProto.transformResponse = function pollutedTransform(
        this: undefined | { auth?: { password?: string; username?: string; }; url?: string; },
        data: unknown
      ) {
        invoked = true;

        const ctx = this;
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
        res.end("{\"secret\":\"keep-me\"}");
      });

      try {
        const { port } = server.address() as AddressInfo;
        const res = await ax.get(`http://127.0.0.1:${port}/users`, {
          auth: { username: "svc-account", password: "prod-secret-key-123!" },
        });

        assert.strictEqual(
          invoked,
          false,
          "polluted transformResponse must not run"
        );
        assert.strictEqual(stolen, null, "no request context must be captured");
        assert.deepStrictEqual(
          res.data,
          { secret: "keep-me" },
          "response data must reach the caller untampered"
        );
      }
      finally {
        await stop(server);
      }
    }, 10000);
  });

  describe("clone-swap regression", () => {
    it("middleware config mutation reflected exactly once in outbound fetch args", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
      );
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      const instance = faxios.create({ baseURL: "http://test.local" }).use(async (ctx, next) => {
        ctx.config.headers.set("X-Custom", "once");
        return next(ctx);
      });

      try {
        await instance.get("/path");
        assert.strictEqual(mockFetch.mock.calls.length, 1);
        const [ , init ] = mockFetch.mock.calls[0] as [unknown, RequestInit];
        const headers = new Headers(init.headers);
        assert.strictEqual(headers.get("X-Custom"), "once");
      }
      finally {
        globalThis.fetch = origFetch;
      }
    });

    it("should not inherit Object.prototype.maxBodyLength from prototype chain", async () => {
      ObjProto.maxBodyLength = 1; // if inherited, a >1-byte body would throw ERR_BAD_REQUEST

      const mockFetch = vi.fn().mockResolvedValue(
        new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
      );
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        // body is >1 byte; should succeed because maxBodyLength=1 is not inherited
        await ax.post("http://test.local/path", { value: "hello" });
        assert.strictEqual(mockFetch.mock.calls.length, 1);
      }
      finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  // use() registers plugins from caller objects; only their own fields may count.
  describe("use() plugin field reads", () => {
    const okFetch = async () => new Response(null, { status: 200 });

    it("ignores an inherited provides on plugins that declare none", async () => {
      ObjProto.provides = { auth: { getToken: async () => "stolen" } };
      let seen: unknown;
      const api = faxios.create({ env: { fetch: okFetch } })
        .use(retry({ delay: 0 }))
        .use(timing(() => undefined))
        .use(async (ctx, next) => {
          seen = Object.keys(ctx.capabilities);
          return next(ctx);
        });
      await api.get("http://test.local/x");

      assert.deepStrictEqual(seen, []);
    });

    it("ignores an inherited middleware on a plugin object without one", () => {
      ObjProto.middleware = async (ctx: unknown, next: (c: unknown) => unknown) => next(ctx);
      assert.throws(
        () => faxios.create().use({ name: "empty" } as never),
        (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE
      );
    });
  });

  // #177: payload keys named like prototype members are caller data, not config, so they reach the wire.
  // #178: no RequestInit member, env constructor, toFormData option or default-instance field is
  // read through Object.prototype.
  describe("payload keys and inherited request reads", () => {
    type Hit = { body: string; method: string | undefined; url: string | undefined; };

    async function startEchoServer(hits: Array<Hit>): Promise<ServerLike> {
      return startHTTPServer((req, res) => {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => { body += chunk; });
        req.on("end", () => {
          hits.push({ method: req.method, url: req.url, body });
          if (req.url === "/start") {
            res.writeHead(302, { Location: "/final" });
            res.end();
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{\"real\":true}");
        });
      });
    }
    const urlOf = (s: ServerLike): string => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    const stop = stopHTTPServer;

    it("sends body keys constructor, prototype and __proto__ unchanged", async () => {
      const hits: Array<Hit> = [];
      const server = await startEchoServer(hits);
      const url = urlOf(server);
      try {
        await ax.post(`${url}/a`, { constructor: "Bob", prototype: 1, name: "n", nested: { constructor: 1 } });
        await ax.post(`${url}/b`, JSON.parse("{\"__proto__\":{\"x\":1},\"ok\":1}"));

        assert.strictEqual(hits[0]!.body, "{\"constructor\":\"Bob\",\"prototype\":1,\"name\":\"n\",\"nested\":{\"constructor\":1}}");
        assert.strictEqual(hits[1]!.body, "{\"__proto__\":{\"x\":1},\"ok\":1}");
        assert.strictEqual(Object.prototype.hasOwnProperty("x"), false);
      }
      finally {
        await stop(server);
      }
    });

    it("sends a params key named constructor in the query string", async () => {
      const hits: Array<Hit> = [];
      const server = await startEchoServer(hits);
      const url = urlOf(server);
      try {
        await ax.get(`${url}/p`, { params: { constructor: "c", q: 1 } });
        assert.strictEqual(hits[0]!.url, "/p?constructor=c&q=1");
      }
      finally {
        await stop(server);
      }
    });

    it.each([
      [ "redirect", "manual" ],
      [ "redirect", "error" ],
      [ "integrity", "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" ],
      [ "referrerPolicy", "bogus" ],
      [ "mode", "navigate" ],
      [ "cache", "only-if-cached" ],
    ])("ignores an inherited RequestInit member %s=%s", async (key, value) => {
      const hits: Array<Hit> = [];
      const server = await startEchoServer(hits);
      const url = urlOf(server);
      ObjProto[key] = value;
      try {
        const res = await ax.get(`${url}/start`);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { real: true });
        assert.deepStrictEqual(hits.map(h => h.url), [ "/start", "/final" ]);
      }
      finally {
        await stop(server);
      }
    });

    // undici still reads an inherited `dispatcher` from options objects it builds itself, and
    // rejects the request with UND_ERR_INVALID_ARG. faxios can't reach those objects; what it
    // guarantees is that the polluted dispatcher never receives the request.
    it("never hands the request to an inherited undici dispatcher", async () => {
      const server = await startEchoServer([]);
      const url = urlOf(server);
      const seen: Array<unknown> = [];
      ObjProto.dispatcher = {
        dispatch(opts: unknown) {
          seen.push(opts);
          throw new Error("hijacked");
        },
      };
      try {
        await ax.get(`${url}/d`, { headers: { Authorization: "Bearer s3cret" } }).catch(() => undefined);
        assert.deepStrictEqual(seen, []);
      }
      finally {
        await stop(server);
      }
    });

    it("never calls an inherited fetch, Request or Response", async () => {
      const hits: Array<Hit> = [];
      const server = await startEchoServer(hits);
      const url = urlOf(server);
      const called: Array<string> = [];
      ObjProto.fetch = async () => {
        called.push("fetch");
        return new Response("{\"forged\":true}", { headers: { "Content-Type": "application/json" } });
      };
      ObjProto.Request = function Request() { called.push("Request"); };
      ObjProto.Response = function Response() { called.push("Response"); };
      try {
        const res = await ax.get(`${url}/f`, { headers: { Authorization: "Bearer s3cret" } });
        assert.deepStrictEqual(res.data, { real: true });
        assert.deepStrictEqual(called, []);
        assert.strictEqual(hits.length, 1);
      }
      finally {
        await stop(server);
      }
    });

    it("sends GET when Object.prototype.method is polluted", async () => {
      const hits: Array<Hit> = [];
      const server = await startEchoServer(hits);
      const url = urlOf(server);
      ObjProto.method = "delete";
      try {
        await ax(`${url}/m1`);
        await ax({ url: `${url}/m2` });
        assert.deepStrictEqual(hits.map(h => h.method), [ "GET", "GET" ]);
      }
      finally {
        await stop(server);
      }
    });

    it("ignores an inherited allowAbsoluteUrls on the default instance", async () => {
      const hits: Array<Hit> = [];
      const server = await startEchoServer(hits);
      const url = urlOf(server);
      ObjProto.allowAbsoluteUrls = false;
      try {
        await ax.get(`${url}/abs`, { baseURL: `${url}/base` });
        assert.strictEqual(hits[0]!.url, "/abs");
      }
      finally {
        await stop(server);
      }
    });

    it("ignores inherited toFormData options when serializing params", async () => {
      const hits: Array<Hit> = [];
      const server = await startEchoServer(hits);
      const url = urlOf(server);
      ObjProto.visitor = () => false;
      ObjProto.maxDepth = -1;
      try {
        await ax.get(`${url}/v`, { params: { apiKey: "K", nested: { a: 1 } } });
        assert.strictEqual(hits[0]!.url, "/v?apiKey=K&nested%5Ba%5D=1");
      }
      finally {
        await stop(server);
      }
    });

    it("passes own fetchOptions extension keys to fetch, but not inherited ones", async () => {
      const inits: Array<Record<string, unknown>> = [];
      const fetch = async (_input: unknown, init?: RequestInit) => {
        inits.push(init as Record<string, unknown>);
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      };
      const api = faxios.create({ env: { fetch } });
      ObjProto.cf = { cacheTtl: 1 };
      await api.get("http://test.local/n", { fetchOptions: { method: "DELETE", next: { revalidate: 60 } } });

      const init = inits[0]!;
      assert.deepStrictEqual(init["next"], { revalidate: 60 });
      assert.strictEqual(init["method"], "GET");
      assert.strictEqual(Object.hasOwn(init, "cf"), false);
      assert.strictEqual(Object.getPrototypeOf(init), null);
    });
  });
});
