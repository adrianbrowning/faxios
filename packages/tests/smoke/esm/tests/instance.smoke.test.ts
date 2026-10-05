import faxios from "faxios";
import { describe, expect, it } from "vitest";

const createFetchMock = responseBody => {
  const calls = [];

  const mockFetch = async (input, init) => {
    calls.push({ input, init: init || {} });
    return new Response(responseBody != null ? responseBody : JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return {
    mockFetch,
    getCalls: () => calls,
  };
};

describe("instance compat (dist export only)", () => {
  it("creates isolated instances with separate defaults", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);

    const clientA = faxios.create({
      baseURL: "http://example.com/api-a",
      headers: { "X-App": "A" },
    });
    const clientB = faxios.create({
      baseURL: "http://example.com/api-b",
      headers: { "X-App": "B" },
    });

    const env = { fetch: mockFetch, Request, Response };
    await clientA.get("/users", { env });
    await clientB.get("/users", { env });

    const [ callA, callB ] = getCalls();
    expect(new URL(callA.input.url).pathname).toBe("/api-a/users");
    expect(new URL(callB.input.url).pathname).toBe("/api-b/users");
    expect(new Headers(callA.init.headers).get("x-app")).toBe("A");
    expect(new Headers(callB.init.headers).get("x-app")).toBe("B");
  });

  it("supports callable instance form instance(config)", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const env = { fetch: mockFetch, Request, Response };
    const client = faxios.create({ baseURL: "http://example.com" });

    await client({ url: "/status", method: "get", env });

    expect(getCalls()).toHaveLength(1);
    expect(getCalls()[0].init.method).toBe("GET");
    expect(new URL(getCalls()[0].input.url).pathname).toBe("/status");
  });

  it("applies instance middleware before dispatch", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const env = { fetch: mockFetch, Request, Response };
    const client = faxios.create({ baseURL: "http://example.com" }).use(async (ctx, next) => {
      ctx.config.headers.set("X-From-Middleware", "yes");
      return next(ctx);
    });

    await client.get("/middleware", { env });

    expect(getCalls()).toHaveLength(1);
    expect(new Headers(getCalls()[0].init.headers).get("x-from-middleware")).toBe("yes");
  });

  it("applies instance middleware after dispatch", async () => {
    const { mockFetch } = createFetchMock(JSON.stringify({ name: "faxios" }));
    const env = { fetch: mockFetch, Request, Response };
    const client = faxios.create({ baseURL: "http://example.com" }).use(async (ctx, next) => {
      const response = await next(ctx);
      return { ...response, data: { ...response.data, wrapped: true } };
    });

    const response = await client.get("/middleware-response", { env });

    expect(response.data).toEqual({ name: "faxios", wrapped: true });
  });

  it("builds URLs with getUri from instance defaults and request params", () => {
    const client = faxios.create({
      baseURL: "http://example.com/api",
      params: { apiKey: "abc" },
    });

    const uri = client.getUri({ url: "/users", params: { page: 2 } });

    expect(uri).toBe("http://example.com/api/users?apiKey=abc&page=2");
  });
});
