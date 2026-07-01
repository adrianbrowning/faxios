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
    faxios.interceptors.request.handlers = [];
    faxios.interceptors.response.handlers = [];
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
