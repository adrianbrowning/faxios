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
    faxios.interceptors.request.clear();
    faxios.interceptors.response.clear();
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

  it("should apply async request interceptor mutations to outbound fetch call", async () => {
    faxios.interceptors.request.use(async config => {
      await Promise.resolve();
      config.headers["x-intercepted"] = "async-yes";
      return config;
    });

    await faxios("/foo");

    expect(lastRequest!.headers.get("x-intercepted")).toBe("async-yes");
  });

  it("should apply sync request interceptor mutations to outbound fetch call", async () => {
    faxios.interceptors.request.use(
      config => {
        config.headers["x-sync"] = "sync-yes";
        return config;
      },
      undefined,
      { synchronous: true }
    );

    await faxios("/foo");

    expect(lastRequest!.headers.get("x-sync")).toBe("sync-yes");
  });

  it("should not call fetch when a request interceptor rejects", async () => {
    faxios.interceptors.request.use(() => {
      throw new Error("interceptor rejection");
    });

    await expect(faxios("/foo")).rejects.toThrow("interceptor rejection");
    expect(lastRequest).toBeUndefined();
  });
});
