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

describe("interceptors compat (dist export only)", () => {
  it("applies request interceptors before dispatch", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const client = faxios.create();

    client.interceptors.request.use(config => {
      config.headers = config.headers || {};
      config.headers["X-One"] = "1";
      return config;
    });

    client.interceptors.request.use(config => {
      config.headers["X-Two"] = "2";
      return config;
    });

    await client.get("http://example.com/resource", {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(getCalls()).toHaveLength(1);
    expect(new Headers(getCalls()[0].init.headers).get("x-one")).toBe("1");
    expect(new Headers(getCalls()[0].init.headers).get("x-two")).toBe("2");
  });

  it("applies response interceptors in registration order", async () => {
    const { mockFetch } = createFetchMock(JSON.stringify({ n: 1 }));
    const client = faxios.create();

    client.interceptors.response.use(response => {
      response.data.n += 1;
      return response;
    });

    client.interceptors.response.use(response => {
      response.data.n *= 10;
      return response;
    });

    const response = await client.get("http://example.com/resource", {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(response.data.n).toBe(20);
  });

  it("supports ejecting request interceptors", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const client = faxios.create();

    const id = client.interceptors.request.use(config => {
      config.headers = config.headers || {};
      config.headers["X-Ejected"] = "yes";
      return config;
    });

    client.interceptors.request.eject(id);

    await client.get("http://example.com/resource", {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(getCalls()).toHaveLength(1);
    expect(new Headers(getCalls()[0].init.headers).get("x-ejected")).toBeNull();
  });

  it("supports async request interceptors", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const client = faxios.create();

    client.interceptors.request.use(async config => {
      await Promise.resolve();
      config.headers = config.headers || {};
      config.headers["X-Async"] = "true";
      return config;
    });

    await client.get("http://example.com/resource", {
      env: { fetch: mockFetch, Request, Response },
    });

    expect(new Headers(getCalls()[0].init.headers).get("x-async")).toBe("true");
  });

  it("propagates errors thrown by request interceptors", async () => {
    const { mockFetch, getCalls } = createFetchMock(null);
    const client = faxios.create();

    client.interceptors.request.use(() => {
      throw new Error("blocked-by-interceptor");
    });

    const err = await client
      .get("http://example.com/resource", {
        env: { fetch: mockFetch, Request, Response },
      })
      .catch(e => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("blocked-by-interceptor");
    expect(getCalls()).toHaveLength(0);
  });
});
