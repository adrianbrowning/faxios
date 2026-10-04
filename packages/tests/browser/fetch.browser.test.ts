import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import faxios from "#src/index.js";

let originalFetch: typeof globalThis.fetch;
let lastRequest: Request | undefined;

const jsonResponse = (body: unknown = {}, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

describe("fetch (vitest browser)", () => {
  beforeEach(() => {
    lastRequest = undefined;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      lastRequest = new Request(input, init);
      return jsonResponse();
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should sanitize request headers containing CRLF characters", async () => {
    await faxios("/foo", {
      headers: {
        "x-test": "\tok\r\nInjected: yes ",
      },
    });

    expect(lastRequest).toBeDefined();
    expect(lastRequest!.headers.get("x-test")).toBe("okInjected: yes");
    expect(lastRequest!.headers.get("Injected")).toBeNull();
  });

  it("should apply middleware config changes to the outbound fetch call", async () => {
    const instance = faxios.create().use(async (ctx, next) => {
      await Promise.resolve();
      ctx.config.headers.set("x-middleware", "async-yes");
      return next(ctx);
    });

    await instance("/foo");

    expect(lastRequest!.headers.get("x-middleware")).toBe("async-yes");
  });

  it("should not call fetch when a middleware rejects", async () => {
    const instance = faxios.create().use(async () => {
      throw new Error("middleware rejection");
    });

    await expect(instance("/foo")).rejects.toThrow("middleware rejection");
    expect(lastRequest).toBeUndefined();
  });
});
