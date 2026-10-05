import faxios from "faxios";
import { describe, expect, it } from "vitest";

const createFetchMock = responseBody => {
  const calls = [];

  const mockFetch = async (input, init) => {
    calls.push({ input, init: init || {} });
    return new Response(responseBody != null ? responseBody : JSON.stringify({ value: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return { mockFetch, getCalls: () => calls };
};

const env = mockFetch => ({ fetch: mockFetch, Request, Response });

describe("middleware compat (dist export only)", () => {
  it("applies config changes from every middleware before dispatch", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const client = faxios.create()
      .use(async (ctx, next) => {
        ctx.config.headers.set("X-One", "1");
        return next(ctx);
      })
      .use(async (ctx, next) => {
        ctx.config.headers.set("X-Two", "2");
        return next(ctx);
      });

    await client.get("http://example.com/resource", { env: env(mockFetch) });

    expect(getCalls()).toHaveLength(1);
    expect(new Headers(getCalls()[0].init.headers).get("x-one")).toBe("1");
    expect(new Headers(getCalls()[0].init.headers).get("x-two")).toBe("2");
  });

  it("unwinds in reverse registration order after dispatch", async () => {
    const { mockFetch } = createFetchMock(JSON.stringify({ n: 1 }));
    const client = faxios.create()
      .use(async (ctx, next) => {
        const response = await next(ctx);
        return { ...response, data: { n: response.data.n * 10 } };
      })
      .use(async (ctx, next) => {
        const response = await next(ctx);
        return { ...response, data: { n: response.data.n + 1 } };
      });

    const response = await client.get("http://example.com/resource", { env: env(mockFetch) });

    expect(response.data.n).toBe(20);
  });

  it("supports ejecting middleware", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const addHeader = async (ctx, next) => {
      ctx.config.headers.set("X-Ejected", "yes");
      return next(ctx);
    };
    const client = faxios.create().use(addHeader);

    client.eject(addHeader);
    await client.get("http://example.com/resource", { env: env(mockFetch) });

    expect(new Headers(getCalls()[0].init.headers).get("x-ejected")).toBeNull();
  });

  it("propagates errors thrown by middleware without dispatching", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const client = faxios.create().use(async () => {
      throw new Error("blocked-by-middleware");
    });

    let err;
    try {
      await client.get("http://example.com/resource", { env: env(mockFetch) });
    }
    catch (e) {
      err = e;
    }

    expect(err).toBeDefined();
    expect(err.message).toContain("blocked-by-middleware");
    expect(getCalls()).toHaveLength(0);
  });
});
