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
    // FaxiosHeaders' loose index signature doesn't unify with FaxiosRequestHeaders; same cast as dispatchRequest.test.ts.
    const emptyHeaders = new FaxiosHeaders() as unknown as InternalFaxiosRequestConfig["headers"];

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
        headers: headers as unknown as InternalFaxiosRequestConfig["headers"],
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
      const config = {
        headers: { Authorization: "Bearer abc" },
        redact: [ "authorization" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      expect((error.toJSON().config as any).headers.Authorization).toBe(
        "[REDACTED ****]"
      );
    });

    it("redacts headers stored in an FaxiosHeaders instance", () => {
      const headers = new FaxiosHeaders();
      headers.set("Authorization", "Bearer abc");
      headers.set("X-Trace", "trace-id");

      const config = { headers, redact: [ "Authorization" ] };
      const error = new FaxiosError("Boom", "ECODE", config as any);

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
      const error = new FaxiosError("Boom", "ECODE", config as any);

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

        expect(snapshot({ obj })).toHaveProperty("obj", obj);
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
        headers: new FaxiosHeaders({ Authorization: "Bearer secret" }) as unknown as InternalFaxiosRequestConfig["headers"],
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
    // FaxiosHeaders' loose index signature doesn't unify with FaxiosRequestHeaders; same cast as dispatchRequest.test.ts.
    const config: InternalFaxiosRequestConfig = { headers: new FaxiosHeaders() as unknown as InternalFaxiosRequestConfig["headers"] };
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
