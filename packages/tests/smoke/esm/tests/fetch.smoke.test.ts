import faxios from "faxios";
import { describe, expect, it } from "vitest";
import { toRequest } from "./helpers.js";
import type { FetchInput } from "./helpers.js";

type Echo = { body: string; contentType: null | string; method: string; url: string; };

const createFetchMock = (responseFactory?: (input: FetchInput, init: RequestInit) => Promise<Response> | Response) => {
  const calls: Array<{ init: RequestInit; input: FetchInput; }> = [];

  const mockFetch = async (input: FetchInput, init?: RequestInit) => {
    calls.push({ input, init: init || {} });

    if (responseFactory) {
      return responseFactory(input, init || {});
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return {
    mockFetch,
    getCalls: () => calls,
  };
};

describe("fetch compat (dist export only)", () => {
  it("uses fetch adapter and resolves JSON response", async () => {
    const { mockFetch, getCalls } = createFetchMock();

    const response = await faxios.get("https://example.com/users", {
      env: {
        fetch: mockFetch,
        Request,
        Response,
      },
    });

    expect(response.data).toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(getCalls()).toHaveLength(1);
  });

  it("sends method, headers and body for post requests", async () => {
    const { mockFetch, getCalls } = createFetchMock(async (input, init) => {
      const request = toRequest(input, init);
      const echo: Echo = {
        url: request.url,
        method: request.method,
        contentType: request.headers.get("content-type"),
        body: await request.text(),
      };

      return new Response(
        JSON.stringify(echo),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    const response = await faxios.post<Echo>(
      "https://example.com/items",
      { name: "widget" },
      {
        env: {
          fetch: mockFetch,
          Request,
          Response,
        },
      }
    );

    expect(getCalls()).toHaveLength(1);
    expect(response.data.url).toBe("https://example.com/items");
    expect(response.data.method).toBe("POST");
    expect(response.data.contentType).toContain("application/json");
    expect(response.data.body).toBe(JSON.stringify({ name: "widget" }));
  });

  it("rejects non-2xx fetch responses by default", async () => {
    const { mockFetch } = createFetchMock(
      () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "Content-Type": "application/json" },
        })
    );

    const err = await faxios
      .get("https://example.com/fail", {
        env: {
          fetch: mockFetch,
          Request,
          Response,
        },
      })
      .catch(e => e);

    expect(faxios.isFaxiosError(err)).toBe(true);
    expect(err.response.status).toBe(500);
  });

  it("supports cancellation with AbortController in fetch mode", async () => {
    const { mockFetch } = createFetchMock();
    const controller = new AbortController();
    controller.abort();

    const err = await faxios
      .get("https://example.com/cancel", {
        signal: controller.signal,
        env: {
          fetch: mockFetch,
          Request,
          Response,
        },
      })
      .catch(e => e);

    expect(faxios.isCancel(err)).toBe(true);
    expect(err.code).toBe("ERR_CANCELED");
  });
});
