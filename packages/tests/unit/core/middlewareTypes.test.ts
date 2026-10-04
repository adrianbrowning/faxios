import { describe, expectTypeOf, it } from "vitest";
import faxios, { FaxiosError } from "#src/index.ts";
import type { FaxiosInstance, FaxiosPlugin } from "#src/index.ts";

// These functions are type-checked by `lint:ts` and never called (except the plain
// expectTypeOf assertions): each call site passes a fresh object literal so excess-property
// checks apply.

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
        expectTypeOf(ctx.capabilities.auth.getToken).toEqualTypeOf<() => Promise<string>>();
        ctx.config.headers.set("Authorization", `Bearer ${await ctx.capabilities.auth.getToken()}`);
        return next(ctx);
      }
    },
  };
}

function staticToken(): FaxiosPlugin<unknown, { auth: { token: string; }; }> {
  return { name: "staticToken", provides: { auth: { token: "t" } }, middleware: async (ctx, next) => next(ctx) };
}

const url = "http://example.test/";
const getToken = async () => "token";

describe("middleware types", () => {
  it("accumulates plugin request options and capabilities through use()", () => {
    const api = faxios.create().use(cache())
      .use(authBearer(getToken))
      .use(refreshOn401());
    expectTypeOf(api).toEqualTypeOf<FaxiosInstance<CacheOptions, AuthCapability>>();
    expectTypeOf(faxios.create().use(async (ctx, next) => next(ctx))).toEqualTypeOf<FaxiosInstance>();
    expectTypeOf(api.create()).toEqualTypeOf<FaxiosInstance>();
  });

  it("starts with no plugin options or capabilities", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- asserting the `{}` defaults themselves
    type NoPlugins = {};
    expectTypeOf(faxios).toEqualTypeOf<FaxiosInstance<NoPlugins, NoPlugins>>();
    expectTypeOf(faxios.create()).toEqualTypeOf<FaxiosInstance<NoPlugins, NoPlugins>>();
    faxios.create().use(async (ctx, next) => {
      // `{}`, not `unknown`: inline middleware can inspect capabilities without narrowing.
      expectTypeOf(Object.keys(ctx.capabilities)).toEqualTypeOf<Array<string>>();
      expectTypeOf("auth" in ctx.capabilities).toEqualTypeOf<boolean>();
      return next(ctx);
    });
  });

  it("accepts plugin options on every config-taking member after use()", () => {
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
      void api.define("GET", url, { cache: { ttlMs: 1 } })({ cache: { ttlMs: 2 } });
      void api.route(url, { cache: { ttlMs: 1 } }).get({ cache: { ttlMs: 1 } })({ cache: { ttlMs: 2 } });
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
      void api({ url, cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api.request({ url, cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api.get(url, { cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api.post(url, {}, { cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api.define("GET", url)({ cache: { ttlMs: 1 } });
      // @ts-expect-error -- cache() not installed
      void api.route(url).get()({ cache: { ttlMs: 1 } });
      const childOfTyped = api.use(cache()).create();
      // @ts-expect-error -- create() children don't inherit plugin options
      void childOfTyped.get(url, { cache: { ttlMs: 1 } });
      // @ts-expect-error -- the option's type is still checked after install
      void api.use(cache()).get(url, { cache: { ttlMs: "1" } });
    }
    void surfaces;
  });

  it("gives middleware the capabilities installed before it", () => {
    function surfaces(): void {
      faxios.create().use(authBearer(getToken))
        .use(async (ctx, next) => {
          expectTypeOf(ctx.capabilities.auth.getToken).toEqualTypeOf<() => Promise<string>>();
          return next(ctx);
        });
    }
    void surfaces;
  });

  it("rejects a plugin whose required capability isn't installed", () => {
    function surfaces(): void {
      const bare = faxios.create();
      const tokenOnly = faxios.create().use(staticToken());
      // @ts-expect-error -- refreshOn401 requires auth
      bare.use(refreshOn401());
      // @ts-expect-error -- auth is installed, but with an incompatible shape
      tokenOnly.use(refreshOn401());
      faxios.create().use(authBearer(getToken))
        .use(refreshOn401());
      faxios.create().use(authBearer(getToken))
        .use(cache())
        .use(refreshOn401());
    }
    void surfaces;
  });

  it("rejects a second plugin that provides an installed capability", () => {
    function surfaces(): void {
      const withAuth = faxios.create().use(authBearer(getToken));
      // @ts-expect-error -- use() throws ERR_BAD_OPTION at runtime for a duplicate capability
      withAuth.use(authBearer(getToken));
      // @ts-expect-error -- same name, different shape: still a duplicate
      withAuth.use(staticToken());
    }
    void surfaces;
  });
});
