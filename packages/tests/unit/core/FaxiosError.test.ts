import { isNativeError } from "node:util/types";
import { describe, expect, it } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import { isSchemaValidationError } from "#src/lib/core/FaxiosError.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";
import faxios from "#src/lib/faxios.js";
import { authBearer } from "#src/lib/plugins/authBearer.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "#src/lib/types.js";

describe("core::FaxiosError", () => {
  it("creates an error with message, config, code, request, response, stack and isFaxiosError", () => {
    const request = { path: "/foo" };
    const response = { status: 200, data: { foo: "bar" } } as any;
    const error = new FaxiosError(
      "Boom!",
      "ESOMETHING",
      { foo: "bar" } as any,
      request,
      response
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Boom!");
    expect(error.config).toEqual({ foo: "bar" });
    expect(error.code).toBe("ESOMETHING");
    expect(error.request).toBe(request);
    expect(error.response).toBe(response);
    expect(error.isFaxiosError).toBe(true);
    expect(error.stack).toBeDefined();
  });

  it("serializes to JSON safely", () => {
    // request/response are intentionally omitted from the serialized shape
    // to avoid circular-reference problems.
    const request = { path: "/foo" };
    const response = { status: 200, data: { foo: "bar" } } as any;
    const error = new FaxiosError(
      "Boom!",
      "ESOMETHING",
      { foo: "bar" } as any,
      request,
      response
    );
    const json = error.toJSON();

    expect(json.message).toBe("Boom!");
    expect(json.config).toEqual({ foo: "bar" });
    expect(json.code).toBe("ESOMETHING");
    expect(json.status).toBe(200);
    expect((json as any).request).toBeUndefined();
    expect((json as any).response).toBeUndefined();
  });

  describe("FaxiosError.from", () => {
    it("adds config, code, request and response to the wrapped error", () => {
      const error = new Error("Boom!");
      const request = { path: "/foo" };
      const response = { status: 200, data: { foo: "bar" } } as any;

      const errorFrom = FaxiosError.from(
        error,
        "ESOMETHING",
        { foo: "bar" } as any,
        request,
        response
      );

      expect(errorFrom.config).toEqual({ foo: "bar" });
      expect(errorFrom.code).toBe("ESOMETHING");
      expect(errorFrom.request).toBe(request);
      expect(errorFrom.response).toBe(response);
      expect(errorFrom.isFaxiosError).toBe(true);
    });

    it("returns an FaxiosError instance", () => {
      const errorFrom = FaxiosError.from(new Error("Boom!"), "ESOMETHING", {
        foo: "bar",
      } as any);

      expect(errorFrom).toBeInstanceOf(FaxiosError);
    });

    it("names the error FaxiosError and keeps the wrapped error on cause", () => {
      const original = new SyntaxError("Unexpected token");

      const errorFrom = FaxiosError.from(original, FaxiosError.ERR_BAD_RESPONSE);

      expect(errorFrom.name).toBe("FaxiosError");
      expect(String(errorFrom)).toBe("FaxiosError: Unexpected token");
      expect(errorFrom.cause).toBe(original);
    });

    it("preserves status from the original error when response is not provided", () => {
      const error = new Error("Network Error") as Error & { status?: number; };
      error.status = 404;

      const errorFrom = FaxiosError.from(error, "ERR_NETWORK", {
        foo: "bar",
      } as any);

      expect(errorFrom.status).toBe(404);
    });

    it("prefers response.status over error.status when response is provided", () => {
      const error = new Error("Error") as Error & { status?: number; };
      error.status = 500;
      const response = { status: 404 };

      const errorFrom = FaxiosError.from(
        error,
        "ERR_BAD_REQUEST",
        {} as any,
        null,
        response as any
      );

      expect(errorFrom.status).toBe(404);
    });
  });

  it("is recognized as a native error by Node util/types", () => {
    expect(isNativeError(new FaxiosError("My Faxios Error"))).toBe(true);
  });

  it("supports static error-code properties", () => {
    const error = new FaxiosError("My Faxios Error", FaxiosError.ECONNABORTED);

    expect(error.code).toBe(FaxiosError.ECONNABORTED);
  });

  it("sets status when response is passed to constructor", () => {
    const error = new FaxiosError("test", "foo", {} as any, {}, {
      status: 400,
    } as any);

    expect(error.status).toBe(400);
  });

  describe("status field behaviour (issue #5330)", () => {
    it("error.status equals response.status for 4xx errors", () => {
      // Regression test: error.status must be directly accessible without
      // going through error.response.status.
      const error = new FaxiosError(
        "Request failed with status code 404",
        FaxiosError.ERR_BAD_REQUEST,
        {} as any,
        {},
        { status: 404, statusText: "Not Found" } as any
      );

      expect(error.status).toBe(404);
      expect(error.status).toBe(error.response!.status);
    });

    it("error.status equals response.status for 5xx errors", () => {
      const error = new FaxiosError(
        "Request failed with status code 503",
        FaxiosError.ERR_BAD_RESPONSE,
        {} as any,
        {},
        { status: 503, statusText: "Service Unavailable" } as any
      );

      expect(error.status).toBe(503);
    });

    it("error.status is undefined when no response is provided (network errors)", () => {
      // Network errors (ECONNREFUSED, ETIMEDOUT, etc.) have no HTTP response,
      // so error.status must be undefined — not 0 or null.
      const error = new FaxiosError(
        "Network Error",
        FaxiosError.ERR_NETWORK,
        {} as any,
        {}
      );

      expect(error.status).toBeUndefined();
      expect(error.response).toBeUndefined();
    });

    it("error.status is included in toJSON output", () => {
      const error = new FaxiosError("test", "ERR_BAD_REQUEST", {} as any, {}, {
        status: 401,
      } as any);

      expect(error.toJSON().status).toBe(401);
    });
  });

  it("keeps message enumerable for backward compatibility", () => {
    const error = new FaxiosError("Test error message", "ERR_TEST", {
      foo: "bar",
    } as any);

    expect(Object.keys(error)).toContain("message");
    expect(Object.entries(error).find(([ key ]) => key === "message")?.[1]).toBe(
      "Test error message"
    );
    expect({ ...error }.message).toBe("Test error message");
    expect(Object.getOwnPropertyDescriptor(error, "message")?.enumerable).toBe(
      true
    );
  });

  // toJSON() always masks the credential keys `authorization`, `proxy-authorization`, `cookie`
  // and `auth` (case-insensitive, at any depth) and strips `user:pass@` from URL strings; a
  // `config.redact` array adds keys.
  describe("toJSON redaction", () => {
    const emptyHeaders = new FaxiosHeaders();

    it("masks credential keys and URL user info by default", () => {
      const headers = new FaxiosHeaders({
        "Authorization": "Bearer secret-token",
        "Proxy-Authorization": "Basic secret-proxy",
        "Cookie": "session=secret-cookie",
        "X-Trace": "trace-id",
      });
      const config: InternalFaxiosRequestConfig = {
        url: "http://user:secret-pw@api.example.com/items",
        baseURL: "https://user:secret-pw@api.example.com",
        auth: { username: "alice", password: "secret-basic" },
        headers,
      };
      const error = new FaxiosError("Boom", "ECODE", config);

      const json = error.toJSON();

      expect(JSON.stringify(json)).not.toContain("secret");
      expect(json.config).toMatchObject({
        url: "http://api.example.com/items",
        baseURL: "https://api.example.com",
        auth: "[REDACTED ****]",
        headers: {
          "Authorization": "[REDACTED ****]",
          "Proxy-Authorization": "[REDACTED ****]",
          "Cookie": "[REDACTED ****]",
          "X-Trace": "trace-id",
        },
      });
    });

    it("strips URL user info from the message and the stack", () => {
      const error = new FaxiosError("connect ECONNREFUSED http://user:secret-pw@api.example.com/items");

      const json = error.toJSON();

      expect(json.message).toBe("connect ECONNREFUSED http://api.example.com/items");
      expect(json.stack).toContain("http://api.example.com/items");
      expect(json.stack).not.toContain("secret-pw");
    });

    it("strips URL user info from a long message in linear time", () => {
      // A path segment of "a." runs made the old unanchored pattern rescan to the end from every letter.
      const error = new FaxiosError(`Network Error: http://host/files/${"a.".repeat(1e5)}`);

      const start = performance.now();
      error.toJSON();

      expect(performance.now() - start).toBeLessThan(50);
    });

    it("masks the token authBearer sent on a failed request", async () => {
      const api = faxios.create({
        baseURL: "http://localhost",
        env: { fetch: async () => new Response(null, { status: 500 }) },
      }).use(authBearer(() => "secret-token"));

      const error = await api.get("/x").catch((err: unknown) => err);

      expect(faxios.isFaxiosError(error)).toBe(true);
      expect(JSON.stringify(error)).not.toContain("secret-token");
    });

    it("ignores inherited redact accessors", () => {
      const prototype = {};
      Object.defineProperty(prototype, "redact", {
        get() {
          throw new Error("inherited redact getter should not run");
        },
      });

      const config: InternalFaxiosRequestConfig = Object.create(prototype);
      config.url = "/kept";
      const error = new FaxiosError("Boom", "ECODE", config);

      expect(error.toJSON().config).toMatchObject({ url: "/kept" });
    });

    it("still masks the default keys when redact is an empty array", () => {
      const config: InternalFaxiosRequestConfig = {
        auth: { username: "alice", password: "secret" },
        headers: emptyHeaders,
        redact: [],
      };
      const error = new FaxiosError("Boom", "ECODE", config);

      expect(error.toJSON().config).toMatchObject({ auth: "[REDACTED ****]" });
    });

    it("replaces top-level matching keys with the redaction marker", () => {
      const config = {
        url: "/api",
        auth: { username: "alice", password: "secret" },
        redact: [ "auth" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      const json = error.toJSON();

      expect((json.config as any).url).toBe("/api");
      expect((json.config as any).auth).toBe("[REDACTED ****]");
    });

    it("replaces matching keys at any nesting depth", () => {
      const config = {
        login: { username: "alice", password: "secret" },
        proxy: { login: { username: "pu", password: "pp" } },
        redact: [ "password" ],
      };
      const error = new FaxiosError("Boom", "ECODE", { ...config, headers: emptyHeaders });

      expect(error.toJSON().config).toMatchObject({
        login: { username: "alice", password: "[REDACTED ****]" },
        proxy: { login: { username: "pu", password: "[REDACTED ****]" } },
      });
    });

    it("matches case-insensitively", () => {
      // Not a default key, so only the folded `redact` entry can mask it.
      const config = {
        login: { apiKey: "secret-key" },
        redact: [ "APIKEY" ],
      };
      const error = new FaxiosError("Boom", "ECODE", { ...config, headers: emptyHeaders });

      expect(error.toJSON().config).toMatchObject({ login: { apiKey: "[REDACTED ****]" } });
    });

    it("redacts headers stored in an FaxiosHeaders instance", () => {
      const headers = new FaxiosHeaders();
      headers.set("Authorization", "Bearer abc");
      headers.set("X-Trace", "trace-id");

      const config = { headers, redact: [ "Authorization" ] };
      const error = new FaxiosError("Boom", "ECODE", config);

      const serialized = (error.toJSON().config as any).headers;
      expect(serialized.Authorization).toBe("[REDACTED ****]");
      expect(serialized["X-Trace"]).toBe("trace-id");
    });

    it("redacts inside arrays of objects", () => {
      const config = {
        items: [{ token: "t1" }, { token: "t2", name: "keep" }],
        redact: [ "token" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      const json = error.toJSON();
      expect((json.config as any).items[0].token).toBe("[REDACTED ****]");
      expect((json.config as any).items[1].token).toBe("[REDACTED ****]");
      expect((json.config as any).items[1].name).toBe("keep");
    });

    it("does not crash on circular config references", () => {
      const config: InternalFaxiosRequestConfig & { login?: object; self?: object; } = {
        headers: emptyHeaders,
        login: { password: "secret" },
        redact: [ "password" ],
      };
      config.self = config;

      const error = new FaxiosError("Boom", "ECODE", config);

      const json = error.toJSON();
      expect(json.config).toMatchObject({ login: { password: "[REDACTED ****]" } });
      expect(Object.prototype.hasOwnProperty.call(json.config, "self")).toBe(
        false
      );
    });

    it("preserves legacy toJSONObject handling for values with toJSON", () => {
      const issuedAt = new Date("2026-01-01T00:00:00.000Z");
      const endpoint = new URL("https://example.com/users");
      const config = {
        issuedAt,
        endpoint,
        login: { password: "secret" },
        redact: [ "password" ],
      };
      const error = new FaxiosError("Boom", "ECODE", { ...config, headers: emptyHeaders });

      const json = error.toJSON();

      expect(json.config).toMatchObject({ login: { password: "[REDACTED ****]" } });
      expect(json.config).toHaveProperty("issuedAt", issuedAt);
      expect(json.config).toHaveProperty("endpoint", endpoint);
    });

    it("does not let a polluted Object.prototype.toJSON bypass redaction", () => {
      class Credentials {
        password: string;
        constructor() {
          this.password = "secret";
        }
      }

      (Object.prototype as any).toJSON = function () {
        return this;
      };

      const config = {
        login: { password: "secret" },
        credentials: new Credentials(),
        items: [{ token: "t1" }],
        redact: [ "password", "token" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      try {
        const json = error.toJSON();

        expect(json.config).toHaveProperty([ "login", "password" ], "[REDACTED ****]");
        expect((json.config as any).credentials.password).toBe(
          "[REDACTED ****]"
        );
        expect((json.config as any).items[0].token).toBe("[REDACTED ****]");
      }
      finally {
        delete (Object.prototype as any).toJSON;
      }
    });

    it("copies __proto__ as data without changing the redaction output prototype", () => {
      const config = { redact: [ "password" ] };
      Object.defineProperty(config, "__proto__", {
        value: { password: "secret" },
        enumerable: true,
        configurable: true,
      });

      const error = new FaxiosError("Boom", "ECODE", config as any);
      const json = error.toJSON();

      expect(Object.getPrototypeOf(json.config)).toBe(null);
      expect(
        Object.prototype.hasOwnProperty.call(json.config, "__proto__")
      ).toBe(true);
      expect((json.config as any).__proto__.password).toBe("[REDACTED ****]");
    });

    it("does not mutate the original config or FaxiosHeaders", () => {
      const headers = new FaxiosHeaders();
      headers.set("Authorization", "Bearer abc");

      const config = {
        auth: { username: "alice", password: "secret" },
        headers,
        redact: [ "password", "Authorization" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config);

      error.toJSON();

      expect(config.auth.password).toBe("secret");
      expect(headers.get("Authorization")).toBe("Bearer abc");
    });

    it("keeps the redact array itself visible in the snapshot", () => {
      const config = {
        auth: { password: "secret" },
        redact: [ "password" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      // Useful for debugging — operators can see what was being redacted.
      expect((error.toJSON().config as any).redact).toEqual([ "password" ]);
    });

    it.each([
      [ "JSON", {}, "{\"username\":\"alice\",\"password\":\"hunter2\"}" ],
      [ "urlencoded", { "Content-Type": "application/x-www-form-urlencoded" }, "username=alice&password=hunter2" ],
    ])("masks redact keys in a %s body and keeps the caller's data on the error", async (_kind, headers, sent) => {
      const bodies: Array<unknown> = [];
      const api = faxios.create({
        baseURL: "http://localhost",
        env: {
          fetch: async (input: Request | string | URL) => {
            bodies.push(await (input as Request).text());
            return new Response(null, { status: 401 });
          },
        },
      });
      const data = { username: "alice", password: "hunter2" };

      const error: unknown = await api.post("/login", data, { headers, redact: [ "password" ] }).catch((err: unknown) => err);
      if (!(error instanceof FaxiosError)) throw new Error("expected the request to reject with a FaxiosError");

      expect(bodies).toEqual([ sent ]);
      expect(error.config?.data).toBe(data);
      expect(error.toJSON().config).toMatchObject({ data: { username: "alice", password: "[REDACTED ****]" } });
      expect(JSON.stringify(error)).not.toContain("hunter2");
    });

    it("masks the instance's redact keys and the request's together", async () => {
      const api = faxios.create({
        baseURL: "http://localhost",
        headers: { "X-Api-Key": "instance-secret" },
        redact: [ "x-api-key" ],
        env: { fetch: async () => new Response(null, { status: 500 }) },
      });

      const error = await api.get("/x", { params: { password: "request-secret" }, redact: [ "password" ] })
        .catch((err: unknown) => err);

      expect(faxios.isFaxiosError(error)).toBe(true);
      expect(JSON.stringify(error)).not.toMatch(/instance-secret|request-secret/);
    });

    it("keeps the rejected password out of schema issues", async () => {
      // A request schema that reports issues the way Valibot does: each object path segment
      // carries the object it checked and the rejected value next to the key.
      const requestSchema = {
        "~standard": {
          version: 1 as const,
          vendor: "valibot-shaped",
          validate: (input: unknown) => ({
            issues: [{ message: "Invalid length", path: [{ type: "object", origin: "value", input, key: "password", value: "hunter2" }] }],
          }),
        },
      };
      const api = faxios.create({ baseURL: "http://localhost", env: { fetch: async () => new Response(null) } });

      const error: unknown = await api.post("/login", { username: "alice", password: "hunter2" }, { requestSchema, redact: [ "password" ] })
        .catch((err: unknown) => err);
      if (!(error instanceof FaxiosError)) throw new Error("expected the request to reject with a FaxiosError");

      expect(error.code).toBe(FaxiosError.ERR_BAD_REQUEST_SCHEMA);
      expect(JSON.stringify(error)).not.toContain("hunter2");
    });

    describe("config snapshot", () => {
      const snapshot = (source: object) => new FaxiosError("Boom", "ECODE", { ...source, headers: emptyHeaders }).toJSON().config;

      it("drops circular references", () => {
        const a: Array<unknown> = [ 0 ];
        const obj = { a };
        a[1] = obj;
        const config: InternalFaxiosRequestConfig & { circular?: object; obj?: object; } = { headers: emptyHeaders, obj };
        config.circular = config;

        expect(new FaxiosError("Boom", "ECODE", config).toJSON().config).toEqual({ obj: { a: [ 0 ] }, headers: {} });
      });

      it("keeps objects with their own toJSON method without rebuilding them", () => {
        const obj = { toJSON: () => ({ ok: 1 }) };

        expect((snapshot({ obj }) as Record<string, unknown>)["obj"]).toBe(obj);
      });

      it("masks redact keys in what a custom toJSON returns, at any depth", () => {
        class Credentials {
          toJSON() {
            return { user: "alice", password: "secret-1", nested: { list: [{ token: "secret-2" }] } };
          }
        }
        const config = { credentials: new Credentials(), login: { toJSON: () => ({ password: "secret-3" }) }, redact: [ "password", "token" ] };

        const json = snapshot(config);

        expect(json).toMatchObject({
          credentials: { user: "alice", password: "[REDACTED ****]", nested: { list: [{ token: "[REDACTED ****]" }] } },
          login: { password: "[REDACTED ****]" },
        });
        expect(JSON.stringify(json)).not.toContain("secret");
      });

      it("serializes what toJSON returns once, as JSON.stringify does, dropping a cycle back to the object", () => {
        const looped: Record<string, unknown> = { password: "secret" };
        looped["toJSON"] = () => ({ self: looped, again: { toJSON: () => looped }, password: looped["password"] });

        const json = snapshot({ looped, redact: [ "password" ] });

        expect(json).toMatchObject({ looped: { password: "[REDACTED ****]" } });
        expect(JSON.stringify(json)).not.toContain("secret");
      });

      it("leaves out a value whose toJSON throws, so the error still serializes", () => {
        const broken = { toJSON: () => { throw new Error("no"); } };

        const json = snapshot({ broken, kept: 1 });

        expect(json).toEqual({ kept: 1, headers: {} });
        expect(() => JSON.stringify(json)).not.toThrow();
      });

      it("serializes a shared object at every occurrence, as it is not a cycle", () => {
        const shared: Record<string, unknown> = { v: 1 };
        shared.self = shared;

        expect(snapshot({ x: shared, y: shared, list: [ shared ] })).toEqual({ x: { v: 1 }, y: { v: 1 }, list: [{ v: 1 }], headers: {} });
      });

      it("serializes deeply nested structures end to end", () => {
        let source: Record<string, unknown> = { v: "leaf" };
        for (let i = 0; i < 25; i++) {
          source = { next: source };
        }

        expect(JSON.stringify(snapshot(source))).toContain("\"leaf\"");
      });
    });
  });

  it("toJSON includes issues when set", () => {
    const error = new FaxiosError("fail", FaxiosError.ERR_BAD_RESPONSE_SCHEMA, {} as any);
    error.issues = [{ message: "expected string" }, { message: "too short", path: [ "name" ] }];
    const json = error.toJSON();
    expect(json.issues).toEqual([{ message: "expected string" }, { message: "too short", path: [ "name" ] }]);
  });

  it("toJSON has issues as undefined when not set", () => {
    const error = new FaxiosError("Boom", "ECODE", {} as any);
    const json = error.toJSON();
    expect(json.issues).toBeUndefined();
  });

  describe("toJSON cause", () => {
    it("includes the cause's name, code and message", () => {
      const original = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" });
      const error = new FaxiosError("Network Error: ECONNREFUSED", FaxiosError.ERR_NETWORK);
      error.cause = original;

      const json = JSON.parse(JSON.stringify(error));

      expect(json.cause).toEqual({ name: "Error", code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:1" });
    });

    it("follows nested causes without their config, stripping URL user info from messages", () => {
      const inner = new TypeError("Failed to parse URL from http://user:secret@host/x");
      const config: InternalFaxiosRequestConfig = {
        headers: new FaxiosHeaders({ Authorization: "Bearer secret" }),
      };
      const middle = FaxiosError.from(inner, FaxiosError.ERR_INVALID_URL, config);
      const outer = new FaxiosError("Boom", "ECODE");
      outer.cause = middle;

      const json = outer.toJSON();

      expect(JSON.stringify(json)).not.toContain("secret");
      expect(json.cause).toEqual({
        name: "FaxiosError",
        code: FaxiosError.ERR_INVALID_URL,
        message: "Failed to parse URL from http://host/x",
        cause: { name: "TypeError", message: "Failed to parse URL from http://host/x" },
      });
    });

    it("stops at a cause that refers back to itself", () => {
      const first = new Error("first");
      const second = new Error("second", { cause: first });
      first.cause = second;
      const error = new FaxiosError("Boom");
      error.cause = first;

      expect(error.toJSON().cause).toEqual({ name: "Error", message: "first", cause: { name: "Error", message: "second" } });
    });

    it("is absent without a cause", () => {
      expect(new FaxiosError("Boom").toJSON().cause).toBeUndefined();
    });
  });

  describe("isSchemaValidationError", () => {
    const config: InternalFaxiosRequestConfig = { headers: new FaxiosHeaders() };
    const response: FaxiosResponse = { data: { name: 123 }, status: 200, statusText: "OK", headers: new FaxiosHeaders(), config };

    it("returns true for FaxiosError with ERR_BAD_RESPONSE_SCHEMA, issues and response", () => {
      const error = new FaxiosError("Response validation failed", FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, undefined, response);
      error.issues = [{ message: "bad" }];

      expect(isSchemaValidationError(error)).toBe(true);
    });

    it("returns false for ERR_BAD_RESPONSE_SCHEMA without a response", () => {
      const error = new FaxiosError("Response validation failed", FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config);
      error.issues = [{ message: "bad" }];

      expect(isSchemaValidationError(error)).toBe(false);
    });

    const { data: _data, ...responseWithoutData } = response;

    it.each([
      [ "an empty object", {}],
      [ "only data", { data: 1 }],
      [ "no data", responseWithoutData ],
      [ "a non-number status", { ...response, status: "200" }],
      [ "no statusText", { ...response, statusText: undefined }],
      [ "no headers", { ...response, headers: undefined }],
      [ "no config", { ...response, config: undefined }],
      [ "a config without headers", { ...response, config: {} }],
      [ "a config whose headers are only inherited", { ...response, config: Object.create({ headers: {} }) as object }],
      [ "data that is only inherited", Object.assign(Object.create({ data: 1 }) as object, responseWithoutData) ],
    ])("returns false for ERR_BAD_RESPONSE_SCHEMA whose response has %s", (_label, malformed) => {
      const error = new FaxiosError("Response validation failed", FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config);
      error.issues = [{ message: "bad" }];
      Object.assign(error, { response: malformed });

      expect(isSchemaValidationError(error)).toBe(false);
    });

    it("returns true for ERR_BAD_REQUEST_SCHEMA with issues", () => {
      const error = new FaxiosError("fail", FaxiosError.ERR_BAD_REQUEST_SCHEMA, {} as any);
      (error as any).issues = [{ message: "bad" }];
      expect(isSchemaValidationError(error)).toBe(true);
    });

    it("returns true for ERR_BAD_PARAMS_SCHEMA with issues", () => {
      const error = new FaxiosError("fail", FaxiosError.ERR_BAD_PARAMS_SCHEMA, {} as any);
      (error as any).issues = [{ message: "bad" }];
      expect(isSchemaValidationError(error)).toBe(true);
    });

    it("returns true for ERR_BAD_PATH_PARAMS_SCHEMA with issues", () => {
      const error = new FaxiosError("fail", FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA, {} as any);
      (error as any).issues = [{ message: "bad" }];
      expect(isSchemaValidationError(error)).toBe(true);
    });

    it("returns false for FaxiosError with different code", () => {
      const error = new FaxiosError("Boom", FaxiosError.ERR_BAD_RESPONSE, {} as any);
      (error as any).issues = [{ message: "bad" }];

      expect(isSchemaValidationError(error)).toBe(false);
    });

    it("returns false for FaxiosError without issues array", () => {
      const error = new FaxiosError("Response validation failed", FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, undefined, response);

      expect(isSchemaValidationError(error)).toBe(false);
    });

    it("returns false for non-FaxiosError", () => {
      expect(isSchemaValidationError(new Error("nope"))).toBe(false);
      expect(isSchemaValidationError(null)).toBe(false);
      expect(isSchemaValidationError("string")).toBe(false);
    });

    it("narrows type so issues and the unvalidated response body are accessible", () => {
      const error = new FaxiosError("Response validation failed", FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, undefined, response);
      error.issues = [{ message: "expected string" }];

      if (isSchemaValidationError(error) && error.code === FaxiosError.ERR_BAD_RESPONSE_SCHEMA) {
        expect(error.issues[0]!.message).toBe("expected string");
        expect(error.response.data).toStrictEqual({ name: 123 });
      }
      else {
        expect.fail("should have narrowed");
      }
    });
  });
});

describe("rejected request stack (#296)", () => {
  it("formats the stitched stack only when it is read", async () => {
    const original = Error.prepareStackTrace;
    let formatted = 0;
    Error.prepareStackTrace = (error, frames) => {
      formatted++;
      return original ? original(error, frames) : `${String(error)}\n    at ${frames.join("\n    at ")}`;
    };
    try {
      const fetch = async () => new Response("missing", { status: 404 });
      const instance = faxios.create({ env: { fetch } });
      let caught: unknown;
      async function callsFaxiosForStackTest() {
        await instance.get("http://localhost/missing");
      }
      try {
        await callsFaxiosForStackTest();
      }
      catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(FaxiosError);
      expect(formatted).toBe(0);

      const stack = (caught as FaxiosError).stack;
      expect(formatted).toBeGreaterThan(0);
      expect(stack).toContain("Request failed with status code 404");
      expect(stack).toContain("callsFaxiosForStackTest");
      expect((caught as FaxiosError).stack).toBe(stack);
    }
    finally {
      Error.prepareStackTrace = original;
    }
  });
});
