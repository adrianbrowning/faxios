// PROTOTYPE (#87): type-level spike for typed .use(). Throwaway; lives only on 87-prototype-typed-use.
import { describe, expectTypeOf, it } from "vitest";
import faxios, { FaxiosError } from "#src/index.ts";
import type { FaxiosInstance, FaxiosPlugin } from "#src/index.ts";

type CacheOptions = { cache?: { ttlMs?: number; key?: string; }; };
type AuthCapability = { auth: { getToken: () => Promise<string>; }; };

function cache(): FaxiosPlugin<unknown, unknown, CacheOptions> {
  return {
    name: "cache",
    middleware: async (ctx, next) => {
      expectTypeOf(ctx.config.cache).toEqualTypeOf<{ ttlMs?: number; key?: string; } | undefined>();
      return next(ctx);
    },
  };
}

function authBearer(getToken: () => Promise<string>): FaxiosPlugin<unknown, AuthCapability> {
  return {
    name: "authBearer",
    provides: { auth: { getToken } },
    middleware: async (ctx, next) => {
      ctx.config.headers.set("Authorization", `Bearer ${await ctx.capabilities.auth.getToken()}`);
      return next(ctx);
    },
  };
}

function refreshOn401(): FaxiosPlugin<AuthCapability> {
  return {
    name: "refreshOn401",
    middleware: async (ctx, next) => {
      try {
        return await next(ctx);
      }
      catch (err) {
        if (!(err instanceof FaxiosError) || err.response?.status !== 401) throw err;
        ctx.config.headers.set("Authorization", `Bearer ${await ctx.capabilities.auth.getToken()}`);
        return next(ctx);
      }
    },
  };
}

const url = "http://example.test/";
const getToken = async () => "token";

describe("typed .use() prototype", () => {
  it("accumulates request options and capabilities through the chain", () => {
    const api = faxios.create().use(cache()).use(authBearer(getToken)).use(refreshOn401());
    expectTypeOf(api).toEqualTypeOf<FaxiosInstance<CacheOptions, AuthCapability>>();
  });

  it("accepts plugin options on every config-taking member only after use()", () => {
    function surfaces(): void {
      const api = faxios.create().use(cache());
      void api({ url, cache: { ttlMs: 1 } });
      void api(url, { cache: { ttlMs: 1 } });
      void api.request({ url, cache: { ttlMs: 1 } });
      void api.get(url, { cache: { ttlMs: 1 } });
      void api.delete(url, { cache: { ttlMs: 1 } });
      void api.head(url, { cache: { ttlMs: 1 } });
      void api.options(url, { cache: { ttlMs: 1 } });
      void api.post(url, {}, { cache: { ttlMs: 1 } });
      void api.put(url, {}, { cache: { ttlMs: 1 } });
      void api.patch(url, {}, { cache: { ttlMs: 1 } });
      void api.query(url, {}, { cache: { ttlMs: 1 } });
      void api.postForm(url, {}, { cache: { ttlMs: 1 } });
      void api.putForm(url, {}, { cache: { ttlMs: 1 } });
      void api.patchForm(url, {}, { cache: { ttlMs: 1 } });
      void api.getUri({ url, cache: { ttlMs: 1 } });
      api.defaults.cache = { ttlMs: 1 };
      const endpoint = api.define("GET", url, { cache: { ttlMs: 1 } });
      void endpoint({ cache: { ttlMs: 2 } });
      const route = api.route(url, { cache: { ttlMs: 1 } });
      void route.get({ cache: { ttlMs: 1 } })({ cache: { ttlMs: 2 } });
      // Middleware registered after the plugin sees the option on ctx.config.
      api.use(async (ctx, next) => {
        expectTypeOf(ctx.config.cache).toEqualTypeOf<{ ttlMs?: number; key?: string; } | undefined>();
        return next(ctx);
      });
    }
    void surfaces;
  });

  it("rejects plugin options without the plugin", () => {
    function surfaces(): void {
      const api = faxios.create();
      // @ts-expect-error -- cache() not installed
      void api.get(url, { cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api.post(url, {}, { cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api({ url, cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api.define("GET", url)({ cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api.route(url).get()({ cache: { ttlMs: 1 } });
      // @ts-expect-error -- wrong option type is still rejected after install
      void api.use(cache()).get(url, { cache: { ttlMs: "1" } });
      // @ts-expect-error -- create() children start untyped
      void api.use(cache()).create().get(url, { cache: { ttlMs: 1 } });
    }
    void surfaces;
  });

  it("rejects a plugin installed before the capability it requires", () => {
    function surfaces(): void {
      // @ts-expect-error -- refreshOn401 requires auth
      faxios.create().use(refreshOn401());
      faxios.create().use(authBearer(getToken)).use(refreshOn401());
      faxios.create().use(authBearer(getToken)).use(cache()).use(refreshOn401());
    }
    void surfaces;
  });
});
