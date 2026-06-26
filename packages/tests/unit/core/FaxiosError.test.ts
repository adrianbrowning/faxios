import { isNativeError } from "node:util/types";
import { describe, it, expect } from "vitest";
import FaxiosError from "#src/lib/core/FaxiosError.js";
import FaxiosHeaders from "#src/lib/core/FaxiosHeaders.js";

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

  // Opt-in redaction: when `config.redact` is an array of key names, every
  // matching key (case-insensitive, at any depth) has its value replaced with
  // the redaction marker in the toJSON snapshot. Undefined leaves the legacy
  // serialization untouched so existing consumers see no behavior change.
  describe("toJSON redaction via config.redact", () => {
    it("leaves config untouched when redact is undefined", () => {
      const config = {
        url: "/api",
        auth: { username: "alice", password: "secret" },
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      const json = error.toJSON();

      expect((json.config as any).auth.username).toBe("alice");
      expect((json.config as any).auth.password).toBe("secret");
    });

    it("ignores inherited redact accessors", () => {
      const prototype = {};
      Object.defineProperty(prototype, "redact", {
        get() {
          throw new Error("inherited redact getter should not run");
        },
      });

      const config = Object.create(prototype);
      config.auth = { username: "alice", password: "secret" };
      const error = new FaxiosError("Boom", "ECODE", config);

      const json = error.toJSON();

      expect((json.config as any).auth.username).toBe("alice");
      expect((json.config as any).auth.password).toBe("secret");
    });

    it("leaves config untouched when redact is an empty array", () => {
      const config = {
        auth: { username: "alice", password: "secret" },
        redact: [],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      expect((error.toJSON().config as any).auth.password).toBe("secret");
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
        auth: { username: "alice", password: "secret" },
        proxy: { auth: { username: "pu", password: "pp" } },
        redact: [ "password" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      const json = error.toJSON();

      expect((json.config as any).auth.username).toBe("alice");
      expect((json.config as any).auth.password).toBe("[REDACTED ****]");
      expect((json.config as any).proxy.auth.password).toBe("[REDACTED ****]");
      expect((json.config as any).proxy.auth.username).toBe("pu");
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
      const config: Record<string, any> = {
        auth: { password: "secret" },
        redact: [ "password" ],
      };
      config.self = config;

      const error = new FaxiosError("Boom", "ECODE", config as any);

      const json = error.toJSON();
      expect((json.config as any).auth.password).toBe("[REDACTED ****]");
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
        auth: { password: "secret" },
        redact: [ "password" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      const json = error.toJSON();

      expect((json.config as any).issuedAt).toBe(issuedAt);
      expect((json.config as any).endpoint).toBe(endpoint);
      expect((json.config as any).auth.password).toBe("[REDACTED ****]");
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
        auth: { password: "secret" },
        credentials: new Credentials(),
        items: [{ token: "t1" }],
        redact: [ "password", "token" ],
      };
      const error = new FaxiosError("Boom", "ECODE", config as any);

      try {
        const json = error.toJSON();

        expect((json.config as any).auth.password).toBe("[REDACTED ****]");
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
  });
});
