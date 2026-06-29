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

describe("adapter (vitest browser)", () => {
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
    faxios.interceptors.request.handlers = [];
    faxios.interceptors.response.handlers = [];
  });

  it("should support custom adapter", async () => {
    const response = await faxios("/foo", {
      async adapter(config) {
        return {
          data: { adapter: "custom" },
          status: 200,
          statusText: "OK",
          headers: { get: () => null },
          config,
          request: null,
        };
      },
    });

    expect(response.data).toEqual({ adapter: "custom" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("should execute adapter code synchronously", async () => {
    let asyncFlag = false;

    const responsePromise = faxios("/foo", {
      async adapter(config) {
        expect(asyncFlag).toBe(false);
        return {
          data: null,
          status: 200,
          statusText: "OK",
          headers: { get: () => null },
          config,
          request: null,
        };
      },
    });

    asyncFlag = true;
    await responsePromise;
  });

  it("should execute adapter code asynchronously when interceptor is present", async () => {
    let asyncFlag = false;

    faxios.interceptors.request.use(config => {
      config.headers.async = "async it!";
      return config;
    });

    const responsePromise = faxios("/foo", {
      async adapter(config) {
        expect(asyncFlag).toBe(true);
        return {
          data: null,
          status: 200,
          statusText: "OK",
          headers: { get: () => null },
          config,
          request: null,
        };
      },
    });

    asyncFlag = true;
    await responsePromise;
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
});
