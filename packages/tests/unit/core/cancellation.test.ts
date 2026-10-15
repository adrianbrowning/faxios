import assert from "node:assert";
import { getEventListeners } from "node:events";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AbortController as PolyfilledController } from "abortcontroller-polyfill/dist/cjs-ponyfill.js";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import faxios, { CanceledError, FaxiosError } from "#src/index.js";
import type { FaxiosRequestConfig } from "#src/index.js";
import { startHTTPServer, stopHTTPServer } from "../../setup/server.js";
import { makeSchema } from "./_schemaTestHelpers.js";

const URL = "http://localhost/test";

function jsonFetch(calls: Array<unknown> = []) {
  return async (input: Request | string | URL) => {
    calls.push(input);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

// Lets every pending promise callback and I/O callback run, without waiting on a timer.
const flush = async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
};

const isBadTimeout = (err: unknown) =>
  err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes("timeout");

const isTimeout = (ms: number) => (err: unknown) =>
  err instanceof FaxiosError && err.code === FaxiosError.ETIMEDOUT && err.message === `timeout of ${ms}ms exceeded`;

describe("core::cancellation", () => {
  describe("abort during async pre-flight validation", () => {
    for (const option of [ "requestSchema", "paramsSchema" ] as const) {
      it(`settles at once without middleware and never calls fetch, while ${option} is still pending`, async () => {
        const calls: Array<unknown> = [];
        const controller = new AbortController();
        const { promise: started, resolve: start } = Promise.withResolvers<void>();
        const { promise: gate, resolve: open } = Promise.withResolvers<void>();
        const schema = makeSchema(async (value: unknown) => {
          start();
          await gate;
          return { value };
        });
        const api = faxios.create({ env: { fetch: jsonFetch(calls) } });

        try {
          let outcome: unknown = "pending";
          const request = api.post(URL, { a: 1 }, { signal: controller.signal, params: { q: 1 }, [option]: schema })
            .then(() => "resolved", (err: unknown) => err);
          void request.then(value => {
            outcome = value;
          });
          await started;
          controller.abort();
          await flush();

          assert.ok(outcome instanceof CanceledError, `expected a CanceledError, got ${String(outcome)}`);
          assert.strictEqual(outcome.code, FaxiosError.ERR_CANCELED);
        }
        finally {
          open();
          await flush();
        }
        assert.strictEqual(calls.length, 0);
      });
    }
  });

  describe("timeout validation", () => {
    for (const timeout of [ -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31 ]) {
      it(`rejects timeout ${timeout} with ERR_BAD_OPTION_VALUE before middleware runs`, async () => {
        const calls: Array<unknown> = [];
        let ran = false;
        const api = faxios.create({ env: { fetch: jsonFetch(calls) } }).use(async (ctx, next) => {
          ran = true;
          return next(ctx);
        });

        await assert.rejects(api.get(URL, { timeout }), isBadTimeout);
        assert.strictEqual(ran, false);
        assert.strictEqual(calls.length, 0);
      });
    }

    it("rejects an out-of-range timeout without middleware", async () => {
      const calls: Array<unknown> = [];
      const api = faxios.create({ env: { fetch: jsonFetch(calls) } });

      await assert.rejects(api.get(URL, { timeout: -1 }), isBadTimeout);
      await assert.rejects(api.get(URL, { timeout: 2 ** 31 }), isBadTimeout);
      assert.strictEqual(calls.length, 0);
    });

    it("accepts 0, the setTimeout limit and a numeric string", async () => {
      const api = faxios.create({ env: { fetch: jsonFetch() } });

      for (const timeout of [ 0, 2_147_483_647, "30" as unknown as number ]) {
        const response = await api.get(URL, { timeout });
        assert.deepStrictEqual(response.data, { ok: true });
      }
    });
  });

  describe("timeout bounds the whole request", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("rejects with ETIMEDOUT while a middleware waits before next(), and sends nothing", async () => {
      const calls: Array<unknown> = [];
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const api = faxios.create({ env: { fetch: jsonFetch(calls) }, timeout: 50 }).use(async (ctx, next) => {
        await gate;
        return next(ctx);
      });

      const request = assert.rejects(api.get(URL), isTimeout(50));
      await vi.advanceTimersByTimeAsync(50);
      await request;
      open();
      await vi.runAllTimersAsync();

      assert.strictEqual(calls.length, 0);
    });

    it("rejects with ETIMEDOUT while an async schema runs, without middleware, and sends nothing", async () => {
      const calls: Array<unknown> = [];
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const schema = makeSchema(async (value: unknown) => {
        await gate;
        return { value };
      });
      const api = faxios.create({ env: { fetch: jsonFetch(calls) } });

      const request = assert.rejects(api.post(URL, { a: 1 }, { timeout: 50, requestSchema: schema }), isTimeout(50));
      await vi.advanceTimersByTimeAsync(50);
      await request;
      open();
      await vi.runAllTimersAsync();

      assert.strictEqual(calls.length, 0);
    });

    it("rejects with ETIMEDOUT while a response schema runs", async () => {
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const schema = makeSchema(async (value: unknown) => {
        await gate;
        return { value };
      });
      const api = faxios.create({ env: { fetch: jsonFetch() } });

      const request = assert.rejects(api.get(URL, { timeout: 50, responseSchema: schema }), isTimeout(50));
      await vi.advanceTimersByTimeAsync(50);
      await request;
      open();
    });

    it("uses timeoutErrorMessage for the whole-request timeout", async () => {
      const api = faxios.create({ env: { fetch: jsonFetch() } }).use(async () => new Promise(() => {}));

      const request = assert.rejects(api.get(URL, { timeout: 50, timeoutErrorMessage: "too slow" }), (err: unknown) =>
        err instanceof FaxiosError && err.code === FaxiosError.ETIMEDOUT && err.message === "too slow");
      await vi.advanceTimersByTimeAsync(50);
      await request;
    });

    // The polyfill keeps its listeners on the signal, where a test can count them. It is a signal
    // the request has to listen on, unlike a native one AbortSignal.any() follows without a listener.
    const polyfillListeners = (signal: object): number => {
      const listeners: unknown = "listeners" in signal ? signal.listeners : undefined;
      if (typeof listeners !== "object" || listeners === null || !("abort" in listeners)) return 0;
      return Array.isArray(listeners.abort) ? listeners.abort.length : 0;
    };

    for (const [ outcome, fetch, expected ] of [
      [ "succeeds", jsonFetch(), undefined ],
      [ "fails with an HTTP error", async () => new Response("no", { status: 500 }), FaxiosError.ERR_BAD_RESPONSE ],
      [ "fails with a network error", async () => Promise.reject(new TypeError("fetch failed")), FaxiosError.ERR_NETWORK ],
    ] as const) {
      it(`clears its timer and leaves no listener on a polyfilled caller signal once the request ${outcome}`, async () => {
        const controller = new PolyfilledController();
        const api = faxios.create({ env: { fetch }, timeout: 1000 });

        const request = api.get(URL, { signal: controller.signal });
        assert.strictEqual(polyfillListeners(controller.signal), 1);
        if (expected) await assert.rejects(request, { code: expected });
        else assert.deepStrictEqual((await request).data, { ok: true });

        assert.strictEqual(vi.getTimerCount(), 0);
        assert.strictEqual(polyfillListeners(controller.signal), 0);
      });
    }

    it("unlinks a long-lived caller signal from each request once it settles", async () => {
      const app = new AbortController();
      const requestSignals: Array<AbortSignal> = [];
      const api = faxios.create({ env: { fetch: jsonFetch() }, timeout: 60_000 }).use(async (ctx, next) => {
        requestSignals.push(ctx.config.signal as AbortSignal);
        return next(ctx);
      });

      for (let i = 0; i < 20; i++) {
        await api.get(URL, { signal: app.signal });
        assert.strictEqual(getEventListeners(app.signal, "abort").length, 0);
      }
      assert.strictEqual(vi.getTimerCount(), 0);
      // A request signal still linked to the caller's aborts with it, and the caller's keeps it alive.
      app.abort();
      assert.deepStrictEqual(requestSignals.map(signal => signal.aborted), Array.from({ length: 20 }, () => false));
    });

    it("rejects with the caller's CanceledError when the caller aborts before the deadline", async () => {
      const controller = new AbortController();
      const reason = new Error("user left");
      const api = faxios.create({ env: { fetch: jsonFetch() }, timeout: 1000 }).use(async () => new Promise(() => {}));

      const request = api.get(URL, { signal: controller.signal });
      controller.abort(reason);
      await assert.rejects(request, (err: unknown) => err instanceof CanceledError && err.message === "user left" && err.cause === reason);
      assert.strictEqual(vi.getTimerCount(), 0);
    });

    it("is armed before middleware runs, so a timeout a middleware sets doesn't change it", async () => {
      const calls: Array<unknown> = [];
      const hangingFetch = async (input: Request | string | URL, init?: RequestInit) => {
        calls.push(input);
        const signal = init!.signal!;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      };
      const api = faxios.create({ env: { fetch: hangingFetch }, timeout: 50 })
        .use(async (ctx, next) => next({ ...ctx, config: { ...ctx.config, timeout: 0 } }));

      const request = assert.rejects(api.get(URL), isTimeout(50));
      await vi.advanceTimersByTimeAsync(50);
      await request;
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(vi.getTimerCount(), 0);
    });

    it("follows a polyfilled caller signal, which AbortSignal.any() can't take", async () => {
      const controller = new PolyfilledController();
      assert.ok(!(controller.signal instanceof AbortSignal));
      const api = faxios.create({ env: { fetch: jsonFetch() }, timeout: 1000 }).use(async () => new Promise(() => {}));

      const request = assert.rejects(api.get(URL, { signal: controller.signal }), (err: unknown) => err instanceof CanceledError && err.message === "user left");
      controller.abort("user left");
      await request;
      assert.strictEqual(vi.getTimerCount(), 0);
    });
  });

  describe("signal validation", () => {
    // The public signal type requires listener methods: without them faxios can't watch the signal.
    const listenerless = { aborted: false } as unknown as AbortSignal;

    for (const timeout of [ undefined, 1000 ]) {
      for (const withMiddleware of [ false, true ]) {
        it(`rejects a signal without listener methods with ERR_BAD_OPTION_VALUE (timeout ${String(timeout)}, ${withMiddleware ? "with" : "without"} middleware)`, async () => {
          const calls: Array<unknown> = [];
          let ran = false;
          const api = faxios.create({ env: { fetch: jsonFetch(calls) } });
          if (withMiddleware) {
            api.use(async (ctx, next) => {
              ran = true;
              return next(ctx);
            });
          }

          await assert.rejects(api.get(URL, { signal: listenerless, timeout }), (err: unknown) =>
            err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes("signal"));
          assert.strictEqual(ran, false);
          assert.strictEqual(calls.length, 0);
        });
      }
    }

    it("rejects a signal without listener methods that a middleware passes on", async () => {
      const calls: Array<unknown> = [];
      const api = faxios.create({ env: { fetch: jsonFetch(calls) } })
        .use(async (ctx, next) => next({ ...ctx, config: { ...ctx.config, signal: listenerless } }));

      await assert.rejects(api.get(URL), { code: FaxiosError.ERR_BAD_OPTION_VALUE });
      assert.strictEqual(calls.length, 0);
    });
  });

  describe("abort reason", () => {
    const reason = new Error("user left");

    const assertCanceledBy = (err: unknown) => {
      assert.ok(err instanceof CanceledError, `expected a CanceledError, got ${String(err)}`);
      assert.strictEqual(err.code, FaxiosError.ERR_CANCELED);
      assert.strictEqual(err.message, "user left");
      assert.strictEqual(err.cause, reason);
      return true;
    };

    it("is the cause when the signal is aborted before the request is sent", async () => {
      const controller = new AbortController();
      controller.abort(reason);

      await assert.rejects(faxios.create({ env: { fetch: jsonFetch() } }).get(URL, { signal: controller.signal }), assertCanceledBy);
      await assert.rejects(
        faxios.create({ env: { fetch: jsonFetch() } }).use(async (ctx, next) => next(ctx))
          .get(URL, { signal: controller.signal }),
        assertCanceledBy
      );
    });

    it("is the cause when the signal is aborted while a middleware waits", async () => {
      const controller = new AbortController();
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      const api = faxios.create({ env: { fetch: jsonFetch() } }).use(async (ctx, next) => {
        await gate;
        return next(ctx);
      });

      const request = api.get(URL, { signal: controller.signal });
      controller.abort(reason);
      try {
        await assert.rejects(request, assertCanceledBy);
      }
      finally {
        open();
      }
    });

    it("is the cause when the signal is aborted during an async schema", async () => {
      const controller = new AbortController();
      const schema = makeSchema(async (value: unknown) => {
        controller.abort(reason);
        return { value };
      });

      await assert.rejects(faxios.create({ env: { fetch: jsonFetch() } }).post(URL, {}, { signal: controller.signal, requestSchema: schema }), assertCanceledBy);
    });

    it("is the cause when the signal is aborted while waiting for the response", async () => {
      const { promise: received, resolve: receive } = Promise.withResolvers<void>();
      const server = await startHTTPServer((_req, res: ServerResponse) => {
        receive();
        res.on("close", () => res.end());
      });
      try {
        const controller = new AbortController();
        const config: FaxiosRequestConfig = { signal: controller.signal, allowAbsoluteUrls: true };
        const request = faxios.get(`http://localhost:${(server.address() as AddressInfo).port}/`, config);
        await received;
        controller.abort(reason);

        await assert.rejects(request, assertCanceledBy);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("is the cause when the signal is aborted while the body is read", async () => {
      const server = await startHTTPServer((_req, res: ServerResponse) => {
        res.setHeader("Content-Type", "text/plain");
        res.write("first chunk");
        res.on("close", () => res.end());
      });
      try {
        const controller = new AbortController();
        const request = faxios.get(`http://localhost:${(server.address() as AddressInfo).port}/`, {
          allowAbsoluteUrls: true,
          signal: controller.signal,
          onDownloadProgress: () => controller.abort(reason),
        });

        await assert.rejects(request, assertCanceledBy);
      }
      finally {
        await stopHTTPServer(server);
      }
    });

    it("takes a string reason as the message", async () => {
      const controller = new AbortController();
      controller.abort("user left");

      await assert.rejects(faxios.create({ env: { fetch: jsonFetch() } }).get(URL, { signal: controller.signal }), (err: unknown) =>
        err instanceof CanceledError && err.message === "user left");
    });
  });
});
