import { describe, expectTypeOf, it } from "vitest";
import faxios, { FaxiosError, FaxiosHeaders } from "#src/index.ts";
import type { FaxiosContext, FaxiosInstance, FaxiosNext, FaxiosPlugin } from "#src/index.ts";

// use() infers through these internal helper types; users write FaxiosPlugin, so neither is
// importable from the package root.
// @ts-expect-error TS2694 -- internal: not exported from the package root
export type RootPluginBase = import("#src/index.ts").FaxiosPluginBase;
// @ts-expect-error TS2694 -- internal: not exported from the package root
export type RootPluginArgument = import("#src/index.ts").FaxiosPluginArgument;

// These functions are type-checked by `lint:ts` and never called (except the plain
// expectTypeOf assertions): each call site passes a fresh object literal so excess-property
// checks apply.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the `{}` defaults of FaxiosInstance
type NoPlugins = {};
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
    // The default export is a FaxiosStatic: the same instance type plus its static helpers.
    expectTypeOf(faxios).toExtend<FaxiosInstance<NoPlugins, NoPlugins>>();
    expectTypeOf(faxios.create()).toEqualTypeOf<FaxiosInstance<NoPlugins, NoPlugins>>();
    faxios.create().use(async (ctx, next) => {
      // `{}`, not `unknown`: inline middleware can inspect capabilities without narrowing.
      expectTypeOf(Object.keys(ctx.capabilities)).toEqualTypeOf<Array<string>>();
      expectTypeOf("auth" in ctx.capabilities).toEqualTypeOf<boolean>();
      return next(ctx);
    });
  });

  it("lets middleware replace ctx.config.headers with a FaxiosHeaders, but not a plain object", () => {
    function surfaces(): void {
      faxios.create().use(async (ctx, next) => {
        ctx.config.headers = new FaxiosHeaders({ "X-From": "middleware" });
        expectTypeOf(ctx.config.headers.set).toBeFunction();
        // @ts-expect-error TS2322 -- reading it back as FaxiosRequestHeaders would lose the accessor methods
        ctx.config.headers = { "X-From": "middleware" };
        return next(ctx);
      });
    }
    void surfaces;
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
      // @ts-expect-error TS2769 -- cache() not installed
      void api({ url, cache: { ttlMs: 1 } });
      // @ts-expect-error TS2769 -- cache() not installed
      void api.request({ url, cache: { ttlMs: 1 } });
      // @ts-expect-error TS2769 -- cache() not installed
      void api.get(url, { cache: { ttlMs: 1 } });
      // @ts-expect-error TS2769 -- cache() not installed
      void api.post(url, {}, { cache: { ttlMs: 1 } });
      // @ts-expect-error TS2353 -- cache() not installed
      void api.define("GET", url)({ cache: { ttlMs: 1 } });
      // @ts-expect-error TS2353 -- cache() not installed
      void api.route(url).get()({ cache: { ttlMs: 1 } });
      const childOfTyped = api.use(cache()).create();
      // @ts-expect-error TS2769 -- create() children don't inherit plugin options
      void childOfTyped.get(url, { cache: { ttlMs: 1 } });
      // @ts-expect-error TS2769 -- the option's type is still checked after install
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
      // @ts-expect-error TS2345 -- refreshOn401 requires auth
      bare.use(refreshOn401());
      // @ts-expect-error TS2345 -- auth is installed, but with an incompatible shape
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
      // @ts-expect-error TS2345 -- use() throws ERR_BAD_OPTION at runtime for a duplicate capability
      withAuth.use(authBearer(getToken));
      // @ts-expect-error TS2345 -- same name, different shape: still a duplicate
      withAuth.use(staticToken());
    }
    void surfaces;
  });

  it("requires provides when a plugin declares a capability", () => {
    function surfaces(): void {
      // @ts-expect-error TS2322 -- claims auth but never supplies it, so ctx.capabilities.auth would be undefined
      const claimsOnly: FaxiosPlugin<unknown, AuthCapability> = { name: "claimsOnly", middleware: async (ctx, next) => next(ctx) };
      const requiresOnly: FaxiosPlugin<AuthCapability, unknown, CacheOptions> = { name: "requiresOnly", middleware: async (ctx, next) => next(ctx) };
      void claimsOnly;
      void requiresOnly;
      // Inline provider with a real provides value: inferred exactly, and a consumer can follow.
      const inline = faxios.create().use({ name: "inlineAuth",
        provides: { auth: { getToken } },
        middleware: async (ctx, next) => {
          expectTypeOf(ctx.capabilities.auth.getToken).toEqualTypeOf<() => Promise<string>>();
          return next(ctx);
        } });
      inline.use(async (ctx, next) => {
        expectTypeOf(ctx.capabilities.auth.getToken).toEqualTypeOf<() => Promise<string>>();
        return next(ctx);
      });
      inline.use(refreshOn401());
      // @ts-expect-error TS2345 -- explicit TProvides without a provides value
      faxios.create().use<unknown, AuthCapability>({ name: "explicit", middleware: async (ctx, next) => next(ctx) });
      // Unannotated: middleware that expects auth can't conjure it without provides.
      const expectsAuth = async (ctx: FaxiosContext<unknown, AuthCapability>, next: FaxiosNext<unknown, AuthCapability>) => next(ctx);
      // @ts-expect-error TS2322 -- nothing provides auth, so this middleware can't be installed
      faxios.create().use({ name: "expectsAuth", middleware: expectsAuth });
    }
    void surfaces;
  });

  it("treats a nullish provides as no capabilities", () => {
    function surfaces(): void {
      const nullish = faxios.create().use({ name: "nullish", provides: undefined, middleware: async (ctx, next) => next(ctx) });
      expectTypeOf(nullish).toEqualTypeOf<FaxiosInstance<NoPlugins, NoPlugins>>();
      // @ts-expect-error TS2345 -- use() skips a nullish provides, so auth is still missing
      nullish.use(refreshOn401());
    }
    void surfaces;
  });

  it("rejects a plugin with a required request option", () => {
    function surfaces(): void {
      const tenant: FaxiosPlugin<unknown, unknown, { tenant: string; }> = { name: "tenant", middleware: async (ctx, next) => next(ctx) };
      // @ts-expect-error TS2345 -- requests that omit tenant would reach the middleware with it undefined
      faxios.create().use(tenant);
      const optionalTenant: FaxiosPlugin<unknown, unknown, { tenant?: string; }> = { name: "tenant", middleware: async (ctx, next) => next(ctx) };
      faxios.create().use(optionalTenant);
    }
    void surfaces;
  });

  it("rejects capability names use() can't copy", () => {
    function surfaces(): void {
      const sym = Symbol("auth");
      // @ts-expect-error TS2345 -- Object.keys() skips symbol keys, so the capability is never set
      faxios.create().use({ name: "symbolCap", provides: { [sym]: { getToken } }, middleware: async (ctx, next) => next(ctx) });
      const protoCap: FaxiosPlugin<unknown, { prototype: string; }> = { name: "protoCap", provides: { prototype: "p" }, middleware: async (ctx, next) => next(ctx) };
      // @ts-expect-error TS2345 -- use() drops prototype-polluting keys
      faxios.create().use(protoCap);
      const needsSym: FaxiosPlugin<{ [sym]: string; }> = { name: "needsSym", middleware: async (ctx, next) => next(ctx) };
      // @ts-expect-error TS2345 -- rejects a symbol capability requirement
      faxios.create().use(needsSym);
      const numericCap: FaxiosPlugin<unknown, { 1: string; }> = { name: "numericCap", provides: { 1: "one" }, middleware: async (ctx, next) => next(ctx) };
      // @ts-expect-error TS2345 -- capability maps are typed with string keys only
      faxios.create().use(numericCap);
    }
    void surfaces;
  });

  it("makes next() take the context the middleware received", () => {
    function surfaces(): void {
      faxios.create().use(authBearer(getToken))
        // @ts-expect-error TS2741 -- dropping auth would break the middleware after this one
        .use(async (ctx, next) => next({ ...ctx, capabilities: {} }));
    }
    void surfaces;
  });

  it("rejects a union of capability maps", () => {
    function surfaces(): void {
      const either: FaxiosPlugin<AuthCapability | { cache: true; }> = { name: "either", middleware: async (ctx, next) => next(ctx) };
      // @ts-expect-error TS2345 -- keyof the union is never, so nothing would be checked
      faxios.create().use(either);
    }
    void surfaces;
  });
});
