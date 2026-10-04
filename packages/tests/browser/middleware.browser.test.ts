import { describe, expect, it } from "vitest";

import faxios from "#src/index.js";

import { installFetchMock } from "./helpers/fetchMock.js";

describe("middleware (vitest browser)", () => {
  it("applies async config changes made before next() to the outbound request", async () => {
    using mock = installFetchMock();
    const instance = faxios.create().use(async (ctx, next) => {
      await Promise.resolve();
      ctx.config.headers.set("x-middleware", "async-yes");
      return next(ctx);
    });

    await instance("/foo");

    expect(mock.lastRequest!.headers.get("x-middleware")).toBe("async-yes");
  });

  it("does not call fetch when a middleware throws before next()", async () => {
    using mock = installFetchMock();
    const instance = faxios.create().use(async () => {
      throw new Error("middleware rejection");
    });

    await expect(instance("/foo")).rejects.toThrow("middleware rejection");
    expect(mock.lastRequest).toBeUndefined();
  });

  it("runs before transformRequest", async () => {
    using mock = installFetchMock();
    const instance = faxios.create().use(async (ctx, next) => {
      ctx.config.data = { ...(ctx.config.data as Record<string, unknown>), baz: "qux" };
      return next(ctx);
    });

    await instance.post("/foo", { foo: "bar" });

    expect(await mock.lastRequest!.clone().text()).toEqual("{\"foo\":\"bar\",\"baz\":\"qux\"}");
  });

  it("can change the base URL before dispatch", async () => {
    using mock = installFetchMock();
    const instance = faxios.create({ baseURL: "http://test.com/" }).use(async (ctx, next) => {
      ctx.config.baseURL = "http://rebase.com/";
      return next(ctx);
    });

    await instance.get("/foo");

    expect(mock.lastRequest!.url).toBe("http://rebase.com/foo");
  });

  it("returns the response a middleware changes after next()", async () => {
    using _mock = installFetchMock();
    const instance = faxios.create().use(async (ctx, next) => {
      const response = await next(ctx);
      return { ...response, data: "changed" };
    });

    const response = await instance("/foo");

    expect(response.data).toBe("changed");
  });
});

describe("prepareRequest regression: clone-swap guards", () => {
  it("middleware config mutation is reflected exactly once in the outbound request", async () => {
    // Guards against a double-merge reintroducing the redundant mergeConfig clone.
    // The middleware sets a custom header; it must appear exactly once (not doubled
    // or absent) in the final fetch call.
    using mock = installFetchMock();
    const instance = faxios.create().use(async (ctx, next) => {
      ctx.config.headers.set("x-middleware", "once");
      return next(ctx);
    });

    await instance.get("/regression/middleware");

    // Headers.get() joins duplicate values with ", " — "once, once" would mean double-merge.
    expect(mock.lastRequest!.headers.get("x-middleware")).toBe("once");
  });

  it("polluted Object.prototype field does not leak into the outbound fetch call", async () => {
    // Guards the null-proto clone in prepareRequest: fetch.ts destructures config
    // fields without hasOwnProp guards, relying on the prototype chain being empty.
    using mock = installFetchMock();

    (Object.prototype as Record<string, unknown>).maxBodyLength = 1;
    try {
      // A real request should succeed; if maxBodyLength=1 leaked, the body-size
      // guard in fetch.ts would reject it (body is empty here, so success proves
      // the polluted value was not read from the prototype chain as an own value).
      const res = await faxios.post("/regression/pollution", { data: "hello" });
      expect(res.status).toBe(200);
      expect(mock.lastRequest).toBeDefined();
    }
    finally {
      delete (Object.prototype as Record<string, unknown>).maxBodyLength;
    }
  });
});
