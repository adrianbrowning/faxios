import { describe, expect, test } from "bun:test";
import faxios from "faxios";

const createFetchCapture = () => {
  const calls: Array<Request> = [];

  const fetch = async (input: unknown, init?: RequestInit) => {
    const request =
      input instanceof Request ? input : new Request(input as string, init);
    calls.push(request);

    return new Response(JSON.stringify({ value: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return {
    fetch,
    getCalls: () => calls,
  };
};

const env = (fetch: typeof globalThis.fetch) => ({
  fetch,
  Request,
  Response,
});

describe("middleware", () => {
  test("middleware header is forwarded to fetch", async () => {
    const { fetch, getCalls } = createFetchCapture();
    const client = faxios.create({ env: env(fetch) }).use(async (ctx, next) => {
      ctx.config.headers.set("X-Added", "yes");
      return next(ctx);
    });

    await client.get("https://example.com/middleware-request");

    expect(getCalls()).toHaveLength(1);
    expect(getCalls()[0].headers.get("x-added")).toBe("yes");
  });

  test("middleware change after next() is reflected in resolved value", async () => {
    const { fetch } = createFetchCapture();
    const client = faxios.create({ env: env(fetch) }).use(async (ctx, next) => {
      const response = await next(ctx);
      const { data } = response;
      const value = data && typeof data === "object" && "value" in data ? String(data.value) : "";
      return { ...response, data: { value: value.toUpperCase() } };
    });

    const response = await client.get("https://example.com/middleware-response");

    expect(response.data).toEqual({ value: "OK" });
  });
});
