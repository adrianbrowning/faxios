import assert from "node:assert";
import { describe, expectTypeOf, it } from "vitest";
import faxios, { CanceledError, FaxiosError, FaxiosHeaders } from "#src/index.js";
import type { FaxiosInstance, FaxiosMiddleware, FaxiosPlugin, FaxiosResponse } from "#src/index.js";

const URL = "http://localhost/test";

type Sent = { url: string; init: RequestInit | undefined; };

function jsonFetch(sent: Array<Sent> = [], status = 200) {
  return async (input: Request | string | URL, init?: RequestInit) => {
    sent.push({ url: input instanceof Request ? input.url : String(input), init });
    return new Response(JSON.stringify({ ok: true }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const sentHeader = (sent: Sent, name: string) => new Headers(sent.init?.headers).get(name);

const passthrough: FaxiosMiddleware = async (ctx, next) => next(ctx);

function plugin(name: string, provides: Record<string, unknown>, middleware: FaxiosMiddleware = passthrough): FaxiosPlugin<unknown, Record<string, unknown>> {
  return { name, provides, middleware };
}

describe("core::middleware", () => {
  it("runs middleware in registration order before dispatch and in reverse order after", async () => {
    const log: Array<string> = [];
    const named = (name: string): FaxiosMiddleware => async (ctx, next) => {
      log.push(`${name} before`);
      const response = await next(ctx);
      log.push(`${name} after`);
      return response;
    };
    const api = faxios.create({
      env: {
        fetch: async () => {
          log.push("dispatch");
          return new Response(null, { status: 200 });
        },
      },
    });

    await api.use(named("a")).use(named("b"))
      .use(named("c"))
      .get(URL);

    assert.deepStrictEqual(log, [ "a before", "b before", "c before", "dispatch", "c after", "b after", "a after" ]);
  });

  it("passes config changes made before next() to the request", async () => {
    const sent: Array<Sent> = [];
    const api = faxios.create({ env: { fetch: jsonFetch(sent) } }).use(async (ctx, next) => {
      ctx.config.headers.set("X-Trace", "abc");
      ctx.config.params = { q: "1" };
      return next(ctx);
    });

    await api.get(URL);

    assert.strictEqual(sentHeader(sent[0]!, "X-Trace"), "abc");
    assert.strictEqual(sent[0]!.url, `${URL}?q=1`);
  });

  it("returns the response a middleware changes after next()", async () => {
    const api = faxios.create({ env: { fetch: jsonFetch() } }).use(async (ctx, next) => {
      const response = await next(ctx);
      return { ...response, data: { wrapped: response.data } };
    });

    const response = await api.get(URL);

    assert.deepStrictEqual(response.data, { wrapped: { ok: true } });
  });

  it("skips dispatch when a middleware returns without calling next()", async () => {
    const sent: Array<Sent> = [];
    const cached = { data: "cached", status: 200, statusText: "OK", headers: {}, config: {} } as unknown as FaxiosResponse;
    const api = faxios.create({ env: { fetch: jsonFetch(sent) } }).use(async () => cached);

    const response = await api.get(URL);

    assert.strictEqual(response, cached);
    assert.strictEqual(sent.length, 0);
  });

  it("lets an outer middleware catch a dispatch rejection", async () => {
    let caught: unknown;
    const fallback = { data: "fallback" } as unknown as FaxiosResponse;
    const api = faxios.create({ env: { fetch: jsonFetch([], 404) } }).use(async (ctx, next) => {
      try {
        return await next(ctx);
      }
      catch (err) {
        caught = err;
        return fallback;
      }
    });

    const response = await api.get(URL);

    assert.strictEqual(response, fallback);
    assert(caught instanceof FaxiosError);
    assert.strictEqual(caught.response?.status, 404);
  });

  it("propagates an inner middleware's error to outer middleware unchanged", async () => {
    const boom = new Error("boom");
    let caught: unknown;
    const api = faxios.create({ env: { fetch: jsonFetch() } })
      .use(async (ctx, next) => {
        try {
          return await next(ctx);
        }
        catch (err) {
          caught = err;
          throw err;
        }
      })
      .use(async () => {
        throw boom;
      });

    await assert.rejects(api.get(URL), boom);
    assert.strictEqual(caught, boom);
  });

  describe("interim nesting with interceptors", () => {
    it("runs request interceptors, dispatch and response interceptors inside the innermost next()", async () => {
      const log: Array<string> = [];
      const api = faxios.create({ env: { fetch: jsonFetch() } });
      api.interceptors.request.use(config => {
        log.push(`request interceptor sees ${String(config.headers.get("X-From-Middleware"))}`);
        return config;
      });
      api.interceptors.response.use(response => {
        log.push("response interceptor");
        return { ...response, data: "from interceptor" };
      });
      api.use(async (ctx, next) => {
        ctx.config.headers.set("X-From-Middleware", "yes");
        const response = await next(ctx);
        log.push(`middleware after sees ${String(response.data)}`);
        return response;
      });

      await api.get(URL);

      assert.deepStrictEqual(log, [ "request interceptor sees yes", "response interceptor", "middleware after sees from interceptor" ]);
    });
  });

  describe("eject()", () => {
    it("stops running ejected middleware and plugins", async () => {
      const log: Array<string> = [];
      const mw: FaxiosMiddleware = async (ctx, next) => {
        log.push("middleware");
        return next(ctx);
      };
      const plug = plugin("p", {}, async (ctx, next) => {
        log.push("plugin");
        return next(ctx);
      });
      const api = faxios.create({ env: { fetch: jsonFetch() } }).use(mw)
        .use(plug);

      api.eject(mw);
      api.eject(plug);
      await api.get(URL);

      assert.deepStrictEqual(log, []);
    });

    it("leaves a request that is already running unchanged", async () => {
      const log: Array<string> = [];
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const inner: FaxiosMiddleware = async (ctx, next) => {
        log.push("inner");
        return next(ctx);
      };
      const api = faxios.create({ env: { fetch: jsonFetch() } })
        .use(async (ctx, next) => {
          await gate;
          return next(ctx);
        })
        .use(inner);

      const request = api.get(URL);
      api.eject(inner);
      open();
      await request;

      assert.deepStrictEqual(log, [ "inner" ]);
    });
  });

  describe("dispatch copy", () => {
    it("dispatches every next() call from the config as middleware left it", async () => {
      const sent: Array<Sent> = [];
      let after: unknown;
      const api = faxios.create({ env: { fetch: jsonFetch(sent) } }).use(async (ctx, next) => {
        await next(ctx);
        const response = await next(ctx);
        after = { url: ctx.config.url, data: ctx.config.data, contentType: ctx.config.headers.has("Content-Type") };
        return response;
      });

      await api.post("http://localhost/items/{id}", { a: 1 }, {
        pathParams: { id: "7" },
        requestSchema: { "~standard": { version: 1, vendor: "test", validate: (v: unknown) => ({ value: { wrapped: v } }) } },
      });

      assert.deepStrictEqual(sent.map(s => [ s.url, s.init?.body ]), [
        [ "http://localhost/items/7", "{\"wrapped\":{\"a\":1}}" ],
        [ "http://localhost/items/7", "{\"wrapped\":{\"a\":1}}" ],
      ]);
      assert.deepStrictEqual(after, { url: "http://localhost/items/{id}", data: { a: 1 }, contentType: false });
    });
  });

  describe("context", () => {
    it("gives middleware FaxiosHeaders and a fresh null-prototype state for each request", async () => {
      const states: Array<Record<PropertyKey, unknown>> = [];
      const headerKinds: Array<boolean> = [];
      const api = faxios.create({ env: { fetch: jsonFetch() } }).use(async (ctx, next) => {
        headerKinds.push(ctx.config.headers instanceof FaxiosHeaders);
        states.push(ctx.state);
        ctx.state["seen"] = true;
        return next(ctx);
      });

      await api.get(URL);
      await api.get(URL);

      assert.deepStrictEqual(headerKinds, [ true, true ]);
      assert.notStrictEqual(states[0], states[1]);
      assert.strictEqual(Object.getPrototypeOf(states[0]), null);
    });
  });

  describe("capabilities", () => {
    it("exposes values a plugin provides to every middleware", async () => {
      const auth = { getToken: async () => "token" };
      let seen: unknown;
      const api = faxios.create({ env: { fetch: jsonFetch() } })
        .use({ name: "auth", provides: { auth }, middleware: async (ctx, next) => next(ctx) })
        .use(async (ctx, next) => {
          const { capabilities } = ctx;
          seen = capabilities && typeof capabilities === "object" && "auth" in capabilities ? capabilities.auth : undefined;
          return next(ctx);
        });

      await api.get(URL);

      assert.strictEqual(seen, auth);
    });

    it("rejects a second plugin that provides the same capability", () => {
      const api = faxios.create().use(plugin("first", { auth: 1 }));

      assert.throws(
        () => api.use(plugin("second", { auth: 2 })),
        (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION
      );
    });

    it("frees a plugin's capabilities when it is ejected", () => {
      const first = plugin("first", { auth: 1 });
      const api = faxios.create().use(first);

      api.eject(first);

      assert.doesNotThrow(() => api.use(plugin("second", { auth: 2 })));
    });

    it("keeps a plugin's capabilities for a request that is already running when it is ejected", async () => {
      let seen: unknown;
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const auth = plugin("auth", { auth: "token" }, async (ctx, next) => {
        const { capabilities } = ctx;
        seen = capabilities && typeof capabilities === "object" && "auth" in capabilities ? capabilities.auth : undefined;
        return next(ctx);
      });
      const api = faxios.create({ env: { fetch: jsonFetch() } })
        .use(async (ctx, next) => {
          await gate;
          return next(ctx);
        })
        .use(auth);

      const request = api.get(URL);
      api.eject(auth);
      open();
      await request;

      assert.strictEqual(seen, "token");
    });

    it("doesn't give a running request capabilities or middleware added after it started", async () => {
      const log: Array<string> = [];
      let seen: unknown;
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const api = faxios.create({ env: { fetch: jsonFetch() } }).use(async (ctx, next) => {
        await gate;
        seen = ctx.capabilities;
        return next(ctx);
      });

      const request = api.get(URL);
      api.use(plugin("late", { late: true }, async (ctx, next) => {
        log.push("late");
        return next(ctx);
      }));
      open();
      await request;

      assert(seen && typeof seen === "object");
      assert.deepStrictEqual(Object.keys(seen), []);
      assert.deepStrictEqual(log, []);
    });

    it("ignores prototype keys in provides", async () => {
      const provides = JSON.parse("{\"__proto__\": {\"polluted\": true}, \"ok\": 1}") as Record<string, unknown>;
      let capabilities: unknown;
      const api = faxios.create({ env: { fetch: jsonFetch() } }).use(plugin("p", provides, async (ctx, next) => {
        capabilities = ctx.capabilities;
        return next(ctx);
      }));

      await api.get(URL);

      assert.strictEqual(Object.getPrototypeOf(capabilities), null);
      assert(capabilities && typeof capabilities === "object");
      assert.deepStrictEqual(Object.keys(capabilities), [ "ok" ]);
      assert.strictEqual("polluted" in {}, false);
    });
  });

  describe("use() return value", () => {
    it("returns the callable instance from a create() instance", async () => {
      const sent: Array<Sent> = [];
      const api = faxios.create({ env: { fetch: jsonFetch(sent) } });

      const chained = api.use(passthrough);
      await chained({ url: URL });
      await chained.get(URL);

      assert.strictEqual(chained, api);
      assert.strictEqual(sent.length, 2);
      expectTypeOf(chained).toEqualTypeOf<FaxiosInstance>();
    });

    it("returns the callable default export", async () => {
      const sent: Array<Sent> = [];
      const chained = faxios.use(passthrough);
      try {
        await chained({ url: URL, env: { fetch: jsonFetch(sent) } });

        assert.strictEqual(chained, faxios);
        assert.strictEqual(sent.length, 1);
        expectTypeOf(chained).toEqualTypeOf<FaxiosInstance>();
      }
      finally {
        faxios.eject(passthrough);
      }
    });
  });

  it("does not pass a parent's middleware to create() children", async () => {
    const log: Array<string> = [];
    const parent = faxios.create({ env: { fetch: jsonFetch() } }).use(async (ctx, next) => {
      log.push("parent");
      return next(ctx);
    });

    await parent.create().get(URL);

    assert.deepStrictEqual(log, []);
  });

  describe("cancellation", () => {
    it("never reaches fetch when the caller aborts while a middleware waits before next()", async () => {
      const sent: Array<Sent> = [];
      const controller = new AbortController();
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const api = faxios.create({ env: { fetch: jsonFetch(sent) } }).use(async (ctx, next) => {
        await gate;
        return next(ctx);
      });

      const request = api.get(URL, { signal: controller.signal });
      controller.abort();
      open();

      await assert.rejects(request, (err: unknown) => err instanceof CanceledError);
      assert.strictEqual(sent.length, 0);
    });

    it("cancels an in-flight request through a middleware that awaits next()", async () => {
      const controller = new AbortController();
      const api = faxios.create({
        env: {
          fetch: async (_input: Request | string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            const abort = () => reject(new DOMException("aborted", "AbortError"));
            if (init?.signal?.aborted) return abort();
            init?.signal?.addEventListener("abort", abort);
          }),
        },
      }).use(async (ctx, next) => {
        const response = await next(ctx);
        return response;
      });

      const request = api.get(URL, { signal: controller.signal });
      controller.abort();

      await assert.rejects(request, (err: unknown) => err instanceof CanceledError);
    });
  });
});
