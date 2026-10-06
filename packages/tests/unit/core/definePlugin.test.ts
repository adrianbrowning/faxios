import assert from "node:assert";
import { describe, expectTypeOf, it } from "vitest";
import faxios, { definePlugin, Faxios } from "#src/index.ts";
import type { FaxiosContext, FaxiosInstance, FaxiosMiddleware, FaxiosPlugin } from "#src/index.ts";
import { authBearer, retry, timing } from "#src/lib/plugins/index.ts";
import type { AuthBearerCapability, RetryRequestOptions } from "#src/lib/plugins/index.ts";

// The type tests below are checked by `lint:ts`; functions named `surfaces` are never called.

type AuthCapability = { auth: { getToken: () => Promise<string>; }; };
type CacheOptions = { cache?: { ttlMs?: number; }; };
type CacheCapability = { cache: { clear: () => void; }; };
const getToken = async () => "token";
const clear = (): void => undefined;

const provider = definePlugin({
  name: "provider",
  provides: { auth: { getToken } },
  middleware: async (ctx, next) => {
    // Unannotated middleware sees the capabilities the plugin provides.
    expectTypeOf(ctx.capabilities.auth.getToken).toEqualTypeOf<() => Promise<string>>();
    return next(ctx);
  },
});

const withOptions = definePlugin({
  name: "withOptions",
  middleware: async (ctx: FaxiosContext<CacheOptions>, next) => {
    expectTypeOf(ctx.config.cache).toEqualTypeOf<{ ttlMs?: number; } | undefined>();
    return next(ctx);
  },
});

const consumer = definePlugin({
  name: "consumer",
  middleware: async (ctx: FaxiosContext<unknown, AuthCapability>, next) => {
    try {
      return await next(ctx);
    }
    catch {
      ctx.config.headers.set("Authorization", `Bearer ${await ctx.capabilities.auth.getToken()}`);
      return next(ctx);
    }
  },
});

// Requires auth and provides cache; its middleware reads both from one context annotation.
const everySlot = definePlugin({
  name: "everySlot",
  provides: { cache: { clear } },
  middleware: async (ctx: FaxiosContext<CacheOptions, AuthCapability & CacheCapability>, next) => {
    ctx.capabilities.cache.clear();
    await ctx.capabilities.auth.getToken();
    return next(ctx);
  },
});

describe("definePlugin", () => {
  it("returns the plugin object it was given", () => {
    const middleware: FaxiosMiddleware = async (ctx, next) => next(ctx);
    const plugin = { name: "same", middleware };
    assert.strictEqual(definePlugin(plugin), plugin);
  });

  it("infers each slot from the object", () => {
    expectTypeOf(provider).toEqualTypeOf<FaxiosPlugin<{ provides: AuthCapability; }>>();
    expectTypeOf(withOptions).toEqualTypeOf<FaxiosPlugin<{ options: CacheOptions; }>>();
    expectTypeOf(consumer).toEqualTypeOf<FaxiosPlugin<{ requires: AuthCapability; }>>();
    // Capabilities the plugin provides itself aren't required.
    expectTypeOf(everySlot).toEqualTypeOf<FaxiosPlugin<{ requires: AuthCapability; provides: CacheCapability; options: CacheOptions; }>>();
    expectTypeOf(definePlugin({ name: "bare", middleware: async (ctx, next) => next(ctx) })).toEqualTypeOf<FaxiosPlugin>();
    expectTypeOf(definePlugin({ name: "nullish", provides: undefined, middleware: async (ctx, next) => next(ctx) })).toEqualTypeOf<FaxiosPlugin>();
  });

  it("types the built-in plugins with the slots they fill", () => {
    expectTypeOf(authBearer(getToken)).toEqualTypeOf<FaxiosPlugin<{ provides: AuthBearerCapability; }>>();
    expectTypeOf(retry()).toEqualTypeOf<FaxiosPlugin<{ options: RetryRequestOptions; }>>();
    expectTypeOf(timing(() => undefined)).toEqualTypeOf<FaxiosPlugin>();
  });

  it("feeds use() the inferred slots", () => {
    const api = faxios.create().use(provider)
      .use(consumer)
      .use(everySlot)
      .use(withOptions);
    expectTypeOf(api).toEqualTypeOf<FaxiosInstance<CacheOptions, AuthCapability & CacheCapability>>();
    function surfaces(): void {
      void api.get("/", { cache: { ttlMs: 1 } });
      // @ts-expect-error TS2345 -- consumer requires auth, which nothing installed provides
      faxios.create().use(consumer);
      // @ts-expect-error TS2345 -- everySlot requires auth too
      faxios.create().use(everySlot);
      // @ts-expect-error TS2769 -- cache is a request option only once withOptions is installed
      void faxios.create().get("/", { cache: { ttlMs: 1 } });
      const withProvider = faxios.create().use(provider);
      // @ts-expect-error TS2345 -- provider and authBearer both provide auth
      withProvider.use(authBearer(getToken));
    }
    void surfaces;
  });

  it("rejects a provides value that contradicts the middleware's context", () => {
    function surfaces(): void {
      definePlugin({
        name: "mismatch",
        // @ts-expect-error TS2322 -- the middleware reads auth.getToken, which this value lacks
        provides: { auth: { token: "t" } },
        middleware: async (ctx: FaxiosContext<unknown, AuthCapability>, next) => {
          await ctx.capabilities.auth.getToken();
          return next(ctx);
        },
      });
      definePlugin({
        name: "unknownField",
        // @ts-expect-error TS2561 -- not a plugin field, so a misspelt provides is caught
        provide: { auth: { getToken } },
        middleware: async (ctx, next) => next(ctx),
      });
    }
    void surfaces;
  });
});

describe("FaxiosPlugin", () => {
  it("takes one object of named slots", () => {
    function surfaces(): void {
      const requiresOnly: FaxiosPlugin<{ requires: AuthCapability; }> = { name: "r", middleware: async (ctx, next) => next(ctx) };
      const optionsOnly: FaxiosPlugin<{ options: CacheOptions; }> = { name: "o", middleware: async (ctx, next) => next(ctx) };
      const providesOnly: FaxiosPlugin<{ provides: CacheCapability; }> = { name: "p", provides: { cache: { clear } }, middleware: async (ctx, next) => next(ctx) };
      void requiresOnly;
      void optionsOnly;
      void providesOnly;
    }
    void surfaces;
  });

  it("rejects a slot it doesn't have", () => {
    // @ts-expect-error TS2344 -- `require` is not a slot; the requirement would be silently dropped
    expectTypeOf<FaxiosPlugin<{ require: AuthCapability; }>>().toBeObject();
  });
});

describe("Faxios class", () => {
  it("doesn't type use() or eject()", () => {
    function surfaces(): void {
      // @ts-expect-error TS2339 -- plugins install through faxios.create() or the default export
      new Faxios().use(provider);
      // @ts-expect-error TS2339 -- eject() goes with use()
      new Faxios().eject(provider);
    }
    void surfaces;
  });
});
