import assert from "node:assert";
import { getEventListeners } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import faxios, { CanceledError, FaxiosError, FaxiosHeaders } from "#src/index.ts";
import type { Method } from "#src/index.ts";
import { retry } from "#src/lib/plugins/retry.ts";

const URL = "http://localhost/retry";

type Reply = "network" | number | { headers: Record<string, string>; status: number; };

// A fetch that plays back one reply per call and records how many calls it saw.
function scriptedFetch(replies: Array<Reply>) {
  const calls: Array<RequestInit | undefined> = [];
  const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
    calls.push(init);
    const reply = replies[Math.min(calls.length, replies.length) - 1]!;
    if (reply === "network") throw new TypeError("fetch failed");
    const { status, headers } = typeof reply === "number" ? { status: reply, headers: {} } : reply;
    return new Response(JSON.stringify({ attempt: calls.length }), { status, headers: { "Content-Type": "application/json", ...headers } });
  };
  return { fetch, calls };
}

const isStatus = (status: number) => (err: unknown) => err instanceof FaxiosError && err.response?.status === status;

// Runs every timer while `request` settles, so a retry the test forbids ends in a failed
// assertion (the retry's reply or a call count), not in a hang until the test timeout.
async function rejectsWithTimers(request: Promise<unknown>, check: (err: unknown) => boolean) {
  const rejected = assert.rejects(request, check);
  await vi.runAllTimersAsync();
  await rejected;
}

describe("plugins::retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Full jitter waits random() × the backoff; half keeps every test's waits exact.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retries network errors and the default statuses until one succeeds", async () => {
    const { fetch, calls } = scriptedFetch([ "network", 503, 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ attempts: 3, delay: 10 }));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    const response = await request;

    assert.strictEqual(calls.length, 3);
    assert.deepStrictEqual(response.data, { attempt: 3 });
  });

  it.each([
    [ "Deno", () => new TypeError("client error (Connect)") ],
    [ "Bun", () => Object.assign(new Error("Unable to connect. Is the computer able to access the url?"), { code: "ConnectionRefused" }) ],
  ])("retries a refused connection worded the way %s words it", async (_runtime, refused) => {
    const calls: Array<unknown> = [];
    const fetch = async (input: Request | string | URL) => {
      calls.push(input);
      throw refused();
    };
    const api = faxios.create({ env: { fetch } }).use(retry({ attempts: 3, delay: 0 }));

    const request = assert.rejects(api.get(URL), (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_NETWORK);
    await vi.runAllTimersAsync();
    await request;

    assert.strictEqual(calls.length, 3);
  });

  it("retries a body whose Proxy prototype chain is a cycle, without hanging", async () => {
    // The middleware after retry answers each try itself: core's request transform walks the
    // body's prototype chain through instanceof, which this test doesn't cover.
    let tries = 0;
    const api = faxios.create()
      .use(retry({ attempts: 2, delay: 0, methods: [ "post" ] }))
      .use(async ctx => {
        tries++;
        if (tries === 1) throw new FaxiosError("fetch failed", FaxiosError.ERR_NETWORK, ctx.config);
        return { config: ctx.config, data: { attempt: tries }, headers: new FaxiosHeaders(), status: 200, statusText: "OK" };
      });
    const body: object = new Proxy({ a: 1 }, { getPrototypeOf: () => body });

    const request = api.post(URL, body);
    await vi.runAllTimersAsync();
    const response = await request;

    assert.strictEqual(tries, 2);
    assert.deepStrictEqual(response.data, { attempt: 2 });
  });

  it("waits the delay before each retry, doubling by default", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 503, 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ jitter: "none" }));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(0);
    assert.strictEqual(calls.length, 1);
    await vi.advanceTimersByTimeAsync(99);
    assert.strictEqual(calls.length, 1);
    await vi.advanceTimersByTimeAsync(1);
    assert.strictEqual(calls.length, 2);
    await vi.advanceTimersByTimeAsync(199);
    assert.strictEqual(calls.length, 2);
    await vi.advanceTimersByTimeAsync(1);
    await request;

    assert.strictEqual(calls.length, 3);
  });

  it("gives up after the configured number of attempts with the last error", async () => {
    const { fetch, calls } = scriptedFetch([ 503 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ attempts: 2, delay: 0 }));

    const request = assert.rejects(api.get(URL), isStatus(503));
    await vi.runAllTimersAsync();
    await request;

    assert.strictEqual(calls.length, 2);
  });

  it("does not retry 4xx responses by default", async () => {
    const { fetch, calls } = scriptedFetch([ 404 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

    await rejectsWithTimers(api.get(URL), isStatus(404));

    assert.strictEqual(calls.length, 1);
  });

  it("retries a try that runs past attemptTimeout, aborting that try's fetch", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      signals.push(signal ?? undefined);
      if (signals.length > 1) return Promise.resolve(new Response(null, { status: 200 }));
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    };
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0, attemptTimeout: 50 }));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(50);
    // Fires the retry's wait only, never the second try's own timer.
    await vi.advanceTimersToNextTimerAsync();
    const response = await request;

    assert.strictEqual(signals.length, 2);
    assert.strictEqual(signals[0]!.aborted, true);
    // The successful try stops its own timer when it settles, not when the timer would fire.
    assert.strictEqual(vi.getTimerCount(), 0);
    assert.strictEqual(signals[1]!.aborted, false);
    assert.strictEqual(response.status, 200);
  });

  it("unlinks a try from the caller's signal in the abort itself, when attemptTimeout ends it", async () => {
    const app = new AbortController();
    let during = -1;
    let afterAbort = -1;
    const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
      during = getEventListeners(app.signal, "abort").length;
      const signal = init!.signal!;
      return new Promise<Response>((_resolve, reject) => {
        // Runs after the try's own abort listener, in the same task: no microtask in between.
        signal.addEventListener("abort", () => {
          afterAbort = getEventListeners(app.signal, "abort").length;
          reject(signal.reason);
        });
      });
    };
    const api = faxios.create({ env: { fetch } }).use(retry({ attempts: 1, delay: 0, attemptTimeout: 50 }));

    await rejectsWithTimers(api.get(URL, { signal: app.signal }), (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ETIMEDOUT);

    assert.ok(during >= 1);
    assert.strictEqual(afterAbort, during - 1);
    assert.strictEqual(getEventListeners(app.signal, "abort").length, 0);
  });

  it("unlinks each try from a long-lived caller signal once the try settles", async () => {
    const { fetch } = scriptedFetch([ 200 ]);
    const app = new AbortController();
    const trySignals: Array<AbortSignal> = [];
    const api = faxios.create({ env: { fetch } })
      .use(retry({ delay: 0, attemptTimeout: 60_000 }))
      .use(async (ctx, next) => {
        trySignals.push(ctx.config.signal as AbortSignal);
        return next(ctx);
      });

    for (let i = 0; i < 20; i++) {
      await api.get(URL, { signal: app.signal });
      assert.strictEqual(getEventListeners(app.signal, "abort").length, 0);
    }
    assert.strictEqual(vi.getTimerCount(), 0);
    // A try signal still linked to the caller's aborts with it, and the caller's keeps it alive.
    app.abort();
    assert.deepStrictEqual(trySignals.map(signal => signal.aborted), Array.from({ length: 20 }, () => false));
  });

  it("keeps a streamed body under the request's timeout after attemptTimeout's try has ended", async () => {
    // Behaves like fetch: aborting the request signal errors the body with the signal's reason.
    const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
      const signal = init!.signal!;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first"));
          signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
      });
      return new Response(body);
    };
    const api = faxios.create({ env: { fetch }, timeout: 100 }).use(retry({ delay: 0, attemptTimeout: 50 }));

    const { data } = await api.get<ReadableStream<Uint8Array>>(URL, { responseType: "stream" });
    const reader = data.getReader();
    await reader.read();
    let outcome: unknown = "pending";
    void reader.read().then(() => "read", (err: unknown) => err)
      .then(value => {
        outcome = value;
      });
    // Past the try's limit: its timer stopped when the response arrived.
    await vi.advanceTimersByTimeAsync(60);
    assert.strictEqual<unknown>(outcome, "pending");
    await vi.advanceTimersByTimeAsync(40);
    assert.ok(outcome instanceof FaxiosError, `expected ETIMEDOUT, got ${String(outcome)}`);
    assert.strictEqual(outcome.code, FaxiosError.ETIMEDOUT);
    assert.strictEqual(outcome.message, "timeout of 100ms exceeded");
    assert.strictEqual(vi.getTimerCount(), 0);
  });

  it("aborts the streamed fetch when the request's timeout passes while a middleware outside retry still waits", async () => {
    const { promise: sent, resolve: send } = Promise.withResolvers<AbortSignal>();
    const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
      const signal = init!.signal!;
      send(signal);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
      });
      return new Response(body);
    };
    const api = faxios.create({ env: { fetch }, timeout: 100 })
      .use(async (ctx, next) => {
        const response = await next(ctx);
        await new Promise(resolve => setTimeout(resolve, 150));
        return response;
      })
      .use(retry({ delay: 0, attemptTimeout: 50 }));

    const request = assert.rejects(api.get(URL, { responseType: "stream" }), { code: FaxiosError.ETIMEDOUT });
    const fetchSignal = await sent;
    await vi.advanceTimersByTimeAsync(100);
    await request;
    // The try had ended, so only the request's deadline can still reach the body it left open.
    assert.strictEqual(fetchSignal.aborted, true);
    await vi.runAllTimersAsync();
  });

  it("rejects a signal without listener methods that a middleware before retry passes on, before any try", async () => {
    const { fetch, calls } = scriptedFetch([ 200 ]);
    // Faxios checks the request's own signal; this one only middleware can introduce.
    const listenerless = { aborted: false } as unknown as AbortSignal;
    const api = faxios.create({ env: { fetch } })
      .use(async (ctx, next) => next({ ...ctx, config: { ...ctx.config, signal: listenerless } }))
      .use(retry({ delay: 0, attemptTimeout: 50 }));

    await assert.rejects(api.get(URL), (err: unknown) =>
      err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes("signal"));
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(vi.getTimerCount(), 0);
  });

  it("rejects a signal with listener methods but no aborted flag that a middleware before retry passes on, before any try", async () => {
    const { fetch, calls } = scriptedFetch([ 200 ]);
    // The rule core applies to the request's own signal: aborted, addEventListener and removeEventListener.
    const flagless = { addEventListener() {}, removeEventListener() {} } as unknown as AbortSignal;
    const api = faxios.create({ env: { fetch } })
      .use(async (ctx, next) => next({ ...ctx, config: { ...ctx.config, signal: flagless } }))
      .use(retry({ delay: 0, attemptTimeout: 50 }));

    await assert.rejects(api.get(URL), (err: unknown) =>
      err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE && err.message.includes("signal"));
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(vi.getTimerCount(), 0);
  });

  it("cancels the stream body of a status error it retries", async () => {
    let cancelled = 0;
    let calls = 0;
    const fetch = async () => {
      calls++;
      const body = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled++;
        },
      });
      return new Response(body, { status: calls === 1 ? 503 : 200 });
    };
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

    const request = api.get<ReadableStream<Uint8Array>>(URL, { responseType: "stream" });
    await vi.advanceTimersByTimeAsync(0);
    const { data } = await request;

    assert.strictEqual(calls, 2);
    // The 503's body never reaches the caller, so retry releases it; the 200's stays open.
    assert.strictEqual(cancelled, 1);
    await data.cancel();
    assert.strictEqual(cancelled, 2);
  });

  it.each([
    [ "an onRetry that throws", { onRetry: () => { throw new Error("hook failed"); } }, (err: unknown) => err instanceof Error && err.message === "hook failed" ],
    [ "a delay that gives no valid wait", { delay: () => Number.NaN }, (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE ],
  ] as const)("cancels the stream body of a status error it drops for %s", async (_label, options, isRejection) => {
    let cancelled = 0;
    const fetch = async () => new Response(new ReadableStream<Uint8Array>({
      cancel() {
        cancelled++;
      },
    }), { status: 503 });
    const api = faxios.create({ env: { fetch } }).use(retry(options));

    await assert.rejects(api.get(URL, { responseType: "stream" }), isRejection);

    // The request rejects with the hook's or the delay's error, so nothing reads the 503's body.
    assert.strictEqual(cancelled, 1);
  });

  it("ends a try whose middleware after retry never resumes once attemptTimeout passes", async () => {
    const { fetch, calls } = scriptedFetch([ 200 ]);
    let tries = 0;
    const api = faxios.create({ env: { fetch } })
      .use(retry({ delay: 0, attemptTimeout: 50 }))
      .use(async (ctx, next) => {
        tries++;
        if (tries === 1) return new Promise(() => {});
        return next(ctx);
      });

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();
    const response = await request;

    assert.strictEqual(tries, 2);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(response.status, 200);
  });

  it("applies a per-request attemptTimeout", async () => {
    const { fetch } = scriptedFetch([ 200 ]);
    let tries = 0;
    const api = faxios.create({ env: { fetch } })
      .use(retry({ delay: 0, attempts: 2 }))
      .use(async (ctx, next) => {
        tries++;
        if (tries === 1) return new Promise(() => {});
        return next(ctx);
      });

    const request = api.get(URL, { retry: { attemptTimeout: 20 } });
    await vi.advanceTimersByTimeAsync(20);
    await vi.runAllTimersAsync();

    assert.strictEqual((await request).status, 200);
    assert.strictEqual(tries, 2);
  });

  it("doesn't retry once the request's timeout passes, and stops a pending wait", async () => {
    const { fetch, calls } = scriptedFetch([ 503 ]);
    const retried: Array<number> = [];
    const api = faxios.create({ env: { fetch }, timeout: 150 })
      .use(retry({ attempts: 5, delay: 100, jitter: "none", onRetry: (_error, attempt) => retried.push(attempt) }));

    const request = assert.rejects(api.get(URL), (err: unknown) =>
      err instanceof FaxiosError && err.code === FaxiosError.ETIMEDOUT && err.message === "timeout of 150ms exceeded");
    await vi.advanceTimersByTimeAsync(150);
    await request;

    // Tries at 0 and 100ms; the deadline lands during the second wait.
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(retried, [ 1, 2 ]);
    assert.strictEqual(vi.getTimerCount(), 0);
  });

  it("doesn't retry a try the request's timeout ended, even with attemptTimeout and tries left", async () => {
    const retried: Array<number> = [];
    let calls = 0;
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      calls++;
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    };
    const api = faxios.create({ env: { fetch }, timeout: 80 })
      .use(retry({ attempts: 5, delay: 0, attemptTimeout: 50, onRetry: (_error, attempt) => retried.push(attempt) }));

    const request = assert.rejects(api.get(URL), (err: unknown) =>
      err instanceof FaxiosError && err.code === FaxiosError.ETIMEDOUT && err.message === "timeout of 80ms exceeded");
    await vi.advanceTimersByTimeAsync(80);
    await request;

    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(retried, [ 1 ]);
    assert.strictEqual(vi.getTimerCount(), 0);
  });

  it("never calls onRetry after the caller aborts, even when retryOn would retry", async () => {
    const controller = new AbortController();
    const retried: Array<number> = [];
    const { promise: sent, resolve: send } = Promise.withResolvers<AbortSignal>();
    const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
      const signal = init!.signal!;
      send(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
    const api = faxios.create({ env: { fetch } })
      .use(async (ctx, next) => {
        try {
          return await next(ctx);
        }
        catch (err) {
          // Seen only by middleware outside retry: the request itself already settled.
          retried.push(-1);
          throw err;
        }
      })
      .use(retry({ delay: 0, retryOn: () => true, onRetry: (_error, attempt) => retried.push(attempt) }));

    const request = assert.rejects(api.get(URL, { signal: controller.signal }), CanceledError);
    const fetchSignal = await sent;
    controller.abort();
    await request;
    // The abort reached the fetch in flight, not only the request's own settling.
    assert.strictEqual(fetchSignal.aborted, true);
    await vi.runAllTimersAsync();

    assert.deepStrictEqual(retried, [ -1 ]);
  });

  it("uses retryOn to decide which failures to retry", async () => {
    const { fetch, calls } = scriptedFetch([ 429, 200 ]);
    const seen: Array<number> = [];
    const api = faxios.create({ env: { fetch } }).use(retry({
      delay: 0,
      retryOn: (err, attempt) => {
        seen.push(attempt);
        return err instanceof FaxiosError && err.response?.status === 429;
      },
    }));

    const request = api.get(URL);
    await vi.runAllTimersAsync();
    await request;

    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(seen, [ 1 ]);
  });

  it("lets a request turn retries off or override the plugin options", async () => {
    const off = scriptedFetch([ 503 ]);
    const once = scriptedFetch([ 503 ]);
    const offApi = faxios.create({ env: { fetch: off.fetch } }).use(retry({ attempts: 5, delay: 0 }));
    const onceApi = faxios.create({ env: { fetch: once.fetch } }).use(retry({ attempts: 5, delay: 0 }));

    await rejectsWithTimers(offApi.get(URL, { retry: false }), isStatus(503));
    const overridden = assert.rejects(onceApi.get(URL, { retry: { attempts: 2 } }), isStatus(503));
    await vi.runAllTimersAsync();
    await overridden;

    assert.strictEqual(off.calls.length, 1);
    assert.strictEqual(once.calls.length, 2);
  });

  it("stops waiting and rejects with CanceledError when the caller aborts during the backoff", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 200 ]);
    const controller = new AbortController();
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 1000 }));

    const request = assert.rejects(api.get(URL, { signal: controller.signal }), (err: unknown) => err instanceof CanceledError);
    await vi.advanceTimersByTimeAsync(10);
    // The first try has answered, so the abort lands in the backoff.
    assert.strictEqual(calls.length, 1);
    controller.abort();
    await request;
    await vi.runAllTimersAsync();

    assert.strictEqual(calls.length, 1);
  });

  it("keeps the abort reason as the cause when the caller aborts during the backoff", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 200 ]);
    const controller = new AbortController();
    const reason = new Error("user left");
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 1000 }));

    const request = assert.rejects(api.get(URL, { signal: controller.signal }), (err: unknown) =>
      err instanceof CanceledError && err.message === "user left" && err.cause === reason);
    await vi.advanceTimersByTimeAsync(10);
    assert.strictEqual(calls.length, 1);
    controller.abort(reason);
    await request;
  });

  it("leaves no abort listener on the caller's signal after an abort during the backoff", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 200 ]);
    const controller = new AbortController();
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 1000 }));

    const request = assert.rejects(api.get(URL, { signal: controller.signal }), (err: unknown) => err instanceof CanceledError);
    await vi.advanceTimersByTimeAsync(10);
    assert.strictEqual(calls.length, 1);
    controller.abort();
    await request;
    await vi.runAllTimersAsync();

    assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
  });

  it("never retries a request the caller canceled", async () => {
    const controller = new AbortController();
    const retried: Array<number> = [];
    let calls = 0;
    // The caller cancels as the first try fails. retryOn retries anything, so only the canceled
    // signal can stop a second try.
    const fetch = async () => {
      calls++;
      controller.abort();
      return new Response(null, { status: 503 });
    };
    const api = faxios.create({ env: { fetch } })
      .use(retry({ delay: 0, retryOn: () => true, onRetry: (_error, attempt) => retried.push(attempt) }));

    const request = assert.rejects(api.get(URL, { signal: controller.signal }), (err: unknown) => err instanceof CanceledError);
    await vi.runAllTimersAsync();
    await request;

    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(retried, []);
  });

  it("does not retry a body that can't be replayed", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("chunk"));
        controller.close();
      },
    });

    // PUT is retried by default, so only the stream check can stop the second try.
    await rejectsWithTimers(api.put(URL, body), isStatus(503));

    assert.strictEqual(calls.length, 1);
  });

  it("does not retry a Node stream body", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

    await rejectsWithTimers(api.put(URL, Readable.from([ "chunk" ])), isStatus(503));

    assert.strictEqual(calls.length, 1);
  });

  it("does not retry an async generator body", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));
    async function* body() {
      yield "chunk";
    }

    await rejectsWithTimers(api.put(URL, body()), isStatus(503));

    assert.strictEqual(calls.length, 1);
  });

  it("sends and replays a plain object body as JSON when Object.prototype.pipe is polluted", async () => {
    const scripted = scriptedFetch([ 503, 200 ]);
    const bodies: Array<string> = [];
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      bodies.push(await (input as Request).text());
      return scripted.fetch(input, init);
    };
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));
    const proto = Object.prototype as Record<string, unknown>;
    proto["pipe"] = () => {};
    try {
      // Settled to a value, so a pre-fix 503 rejection isn't unhandled while the timers run.
      const outcome = api.put(URL, { order: 1 }).catch((err: unknown) => err);
      await vi.runAllTimersAsync();
      await outcome;
    }
    finally {
      delete proto["pipe"];
    }

    assert.deepStrictEqual(bodies, [ "{\"order\":1}", "{\"order\":1}" ]);
  });

  it("does not retry a POST or PATCH by default", async () => {
    const post = scriptedFetch([ 503, 200 ]);
    const patch = scriptedFetch([ "network", 200 ]);

    await rejectsWithTimers(faxios.create({ env: { fetch: post.fetch } }).use(retry({ delay: 0 }))
      .post(URL, { order: 1 }), isStatus(503));
    await rejectsWithTimers(faxios.create({ env: { fetch: patch.fetch } }).use(retry({ delay: 0 }))
      .patch(URL, { order: 1 }), (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_NETWORK);

    assert.strictEqual(post.calls.length, 1);
    assert.strictEqual(patch.calls.length, 1);
  });

  it("retries the methods listed in `methods`, from the plugin or per request", async () => {
    const fromPlugin = scriptedFetch([ 503, 200 ]);
    const perRequest = scriptedFetch([ 503, 200 ]);
    const getOnly = scriptedFetch([ 503, 200 ]);

    const a = faxios.create({ env: { fetch: fromPlugin.fetch } }).use(retry({ delay: 0, methods: [ "post" ] }))
      .post(URL, {});
    const b = faxios.create({ env: { fetch: perRequest.fetch } }).use(retry({ delay: 0 }))
      .post(URL, {}, { retry: { methods: [ "POST" ] } });
    const c = assert.rejects(faxios.create({ env: { fetch: getOnly.fetch } }).use(retry({ delay: 0, methods: [ "get" ] }))
      .put(URL, {}), isStatus(503));
    await vi.runAllTimersAsync();
    await Promise.all([ a, b, c ]);

    assert.strictEqual(fromPlugin.calls.length, 2);
    assert.strictEqual(perRequest.calls.length, 2);
    assert.strictEqual(getOnly.calls.length, 1);
  });

  it("asks retryOn only about methods in `methods`, so a POST needs both", async () => {
    const retryOnOnly = scriptedFetch([ 503, 200 ]);
    const withMethods = scriptedFetch([ 503, 200 ]);
    const retryOn = vi.fn(() => true);

    const a = assert.rejects(faxios.create({ env: { fetch: retryOnOnly.fetch } }).use(retry({ delay: 0, retryOn }))
      .post(URL, {}), isStatus(503));
    const b = faxios.create({ env: { fetch: withMethods.fetch } }).use(retry({ delay: 0, retryOn, methods: [ "post" ] }))
      .post(URL, {});
    await vi.runAllTimersAsync();
    await Promise.all([ a, b ]);

    assert.strictEqual(retryOnOnly.calls.length, 1);
    assert.strictEqual(withMethods.calls.length, 2);
    assert.strictEqual(retryOn.mock.calls.length, 1);
  });

  it("ignores retry settings inherited from a polluted Object.prototype", async () => {
    const { fetch, calls } = scriptedFetch([ 503 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));
    const proto = Object.prototype as Record<string, unknown>;
    proto["attempts"] = 10;
    proto["retry"] = false;
    try {
      const request = assert.rejects(api.get(URL), isStatus(503));
      await vi.runAllTimersAsync();
      await request;
    }
    finally {
      delete proto["attempts"];
      delete proto["retry"];
    }

    // The default 3 tries: neither the inherited attempts nor the inherited retry: false applied.
    assert.strictEqual(calls.length, 3);
  });

  it("passes a null-prototype ctx.config to middleware after it when attemptTimeout is set", async () => {
    const { fetch } = scriptedFetch([ 200 ]);
    let proto: unknown = "unset";
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0, attemptTimeout: 50 }))
      .use(async (ctx, next) => {
        proto = Object.getPrototypeOf(ctx.config);
        return next(ctx);
      });

    await api.get(URL);

    assert.strictEqual(proto, null);
  });

  describe("policy", () => {
    // Advances fake time by `ms` and reports how many tries fetch saw by then.
    const callsAfter = async (calls: Array<unknown>, ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      return calls.length;
    };

    it("retries 408, 429, 500, 502, 503 and 504 by default, and no other status", async () => {
      for (const status of [ 408, 429, 500, 502, 503, 504 ]) {
        const { fetch, calls } = scriptedFetch([ status, 200 ]);
        const request = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }))
          .get(URL);
        await vi.runAllTimersAsync();
        await request;
        assert.strictEqual(calls.length, 2, `status ${status}`);
      }
      for (const status of [ 400, 404, 501, 505, 599 ]) {
        const { fetch, calls } = scriptedFetch([ status, 200 ]);
        await rejectsWithTimers(faxios.create({ env: { fetch } }).use(retry({ delay: 0 }))
          .get(URL), isStatus(status));
        assert.strictEqual(calls.length, 1, `status ${status}`);
      }
    });

    it("retries the statuses listed in `statuses` instead, from the plugin or per request", async () => {
      const teapot = scriptedFetch([ 418, 200 ]);
      const unavailable = scriptedFetch([ 503, 200 ]);
      const perRequest = scriptedFetch([ 418, 200 ]);

      const a = faxios.create({ env: { fetch: teapot.fetch } }).use(retry({ delay: 0, statuses: [ 418 ] }))
        .get(URL);
      const b = assert.rejects(faxios.create({ env: { fetch: unavailable.fetch } }).use(retry({ delay: 0, statuses: [ 418 ] }))
        .get(URL), isStatus(503));
      const c = faxios.create({ env: { fetch: perRequest.fetch } }).use(retry({ delay: 0 }))
        .get(URL, { retry: { statuses: [ 418 ] } });
      await vi.runAllTimersAsync();
      await Promise.all([ a, b, c ]);

      assert.strictEqual(teapot.calls.length, 2);
      assert.strictEqual(unavailable.calls.length, 1);
      assert.strictEqual(perRequest.calls.length, 2);
    });

    it("ignores `statuses` when a custom retryOn replaces the default predicate", async () => {
      const { fetch, calls } = scriptedFetch([ 501, 200 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0, statuses: [ 418 ], retryOn: () => true }));

      const request = api.get(URL);
      await vi.runAllTimersAsync();
      await request;

      assert.strictEqual(calls.length, 2);
    });

    it("waits Retry-After seconds on a 503 instead of the backoff, without jitter", async () => {
      const { fetch, calls } = scriptedFetch([{ status: 503, headers: { "Retry-After": "2" } }, 200 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 10 }));

      const request = api.get(URL);
      assert.strictEqual(await callsAfter(calls, 1999), 1);
      assert.strictEqual(await callsAfter(calls, 1), 2);
      await request;
    });

    it("waits until a Retry-After HTTP date on a 429", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const { fetch, calls } = scriptedFetch([{ status: 429, headers: { "Retry-After": "Thu, 01 Jan 2026 00:00:03 GMT" } }, 200 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 10 }));

      const request = api.get(URL);
      assert.strictEqual(await callsAfter(calls, 2999), 1);
      assert.strictEqual(await callsAfter(calls, 1), 2);
      await request;
    });

    it("uses the backoff when Retry-After is on another status or unparseable, and retries at once for a past date", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const replies: Array<Reply> = [
        { status: 500, headers: { "Retry-After": "60" } },
        { status: 503, headers: { "Retry-After": "soon" } },
        { status: 503, headers: { "Retry-After": "Wed, 31 Dec 2025 23:59:00 GMT" } },
        200,
      ];
      const { fetch, calls } = scriptedFetch(replies);
      const api = faxios.create({ env: { fetch } }).use(retry({ attempts: 4, delay: 100, jitter: "none" }));

      const request = api.get(URL);
      assert.strictEqual(await callsAfter(calls, 100), 2);
      assert.strictEqual(await callsAfter(calls, 100), 3);
      // A date in the past means "now", not the 100ms backoff.
      assert.strictEqual(await callsAfter(calls, 1), 4);
      await request;
    });

    it.each([ "1.5", "-1", "+5", "3,", "12/25", "1 2", "garbage", "2026-01-01T00:00:00Z", "Thu, 01 Jan 2026 00:00:03 UTC" ])(
      "waits the computed backoff when Retry-After is %j",
      async value => {
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const { fetch, calls } = scriptedFetch([{ status: 503, headers: { "Retry-After": value } }, 200 ]);
        const api = faxios.create({ env: { fetch } }).use(retry({ delay: 50, jitter: "none" }));

        const request = api.get(URL);
        assert.strictEqual(await callsAfter(calls, 49), 1);
        assert.strictEqual(await callsAfter(calls, 1), 2);
        await request;
      }
    );

    it.each([
      [ "IMF-fixdate", "Thu, 01 Jan 2026 00:00:03 GMT" ],
      [ "RFC 850", "Thursday, 01-Jan-26 00:00:03 GMT" ],
      [ "asctime", "Thu Jan  1 00:00:03 2026" ],
    ])("waits until a Retry-After %s date", async (_form, value) => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const { fetch, calls } = scriptedFetch([{ status: 503, headers: { "Retry-After": value } }, 200 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 10, jitter: "none" }));

      const request = api.get(URL);
      assert.strictEqual(await callsAfter(calls, 2999), 1);
      assert.strictEqual(await callsAfter(calls, 1), 2);
      await request;
    });

    it("rethrows without retrying when Retry-After is past maxRetryAfter (default 5 minutes)", async () => {
      const tooLong = scriptedFetch([{ status: 503, headers: { "Retry-After": "301" } }, 200 ]);
      const allowed = scriptedFetch([{ status: 503, headers: { "Retry-After": "301" } }, 200 ]);

      await rejectsWithTimers(faxios.create({ env: { fetch: tooLong.fetch } }).use(retry())
        .get(URL), isStatus(503));
      const request = faxios.create({ env: { fetch: allowed.fetch } }).use(retry({ maxRetryAfter: 301_000 }))
        .get(URL);
      assert.strictEqual(await callsAfter(allowed.calls, 300_999), 1);
      assert.strictEqual(await callsAfter(allowed.calls, 1), 2);
      await request;

      assert.strictEqual(tooLong.calls.length, 1);
    });

    it("never retries at once on a Retry-After too large for a timer", async () => {
      const { fetch, calls } = scriptedFetch([{ status: 503, headers: { "Retry-After": "99999999999" } }, 200 ]);
      const request = assert.rejects(faxios.create({ env: { fetch } }).use(retry())
        .get(URL), isStatus(503));
      await vi.advanceTimersByTimeAsync(1);
      await request;

      assert.strictEqual(calls.length, 1);
    });

    it("waits the whole Retry-After when maxRetryAfter is at the setTimeout limit", async () => {
      const { fetch, calls } = scriptedFetch([{ status: 503, headers: { "Retry-After": "2147483" } }, 200 ]);
      const request = faxios.create({ env: { fetch } }).use(retry({ maxRetryAfter: 2_147_483_647 }))
        .get(URL);

      assert.strictEqual(await callsAfter(calls, 2_147_482_999), 1);
      assert.strictEqual(await callsAfter(calls, 1), 2);
      await request;
    });

    it("waits the computed backoff instead of Retry-After when respectRetryAfter is false", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const replies: Array<Reply> = [
        { status: 429, headers: { "Retry-After": "5" } },
        { status: 503, headers: { "Retry-After": "Thu, 01 Jan 2026 00:00:10 GMT" } },
        // Past maxRetryAfter: retried after the backoff, not rethrown.
        { status: 503, headers: { "Retry-After": "86400" } },
        200,
      ];
      const { fetch, calls } = scriptedFetch(replies);
      const waits: Array<number> = [];
      const api = faxios.create({ env: { fetch } }).use(retry({
        attempts: 4,
        delay: 100,
        jitter: "none",
        respectRetryAfter: false,
        onRetry: (_error, _attempt, delayMs) => waits.push(delayMs),
      }));

      const request = api.get(URL);
      assert.strictEqual(await callsAfter(calls, 99), 1);
      assert.strictEqual(await callsAfter(calls, 1), 2);
      assert.strictEqual(await callsAfter(calls, 100), 3);
      assert.strictEqual(await callsAfter(calls, 100), 4);
      await request;

      assert.deepStrictEqual(waits, [ 100, 100, 100 ]);
    });

    it("lets a request override respectRetryAfter in either direction", async () => {
      const reply = (): Reply => ({ status: 429, headers: { "Retry-After": "2" } });
      const ignoring = scriptedFetch([ reply(), 200 ]);
      const respecting = scriptedFetch([ reply(), 200 ]);

      const a = faxios.create({ env: { fetch: ignoring.fetch } }).use(retry({ delay: 100, jitter: "none" }))
        .get(URL, { retry: { respectRetryAfter: false } });
      const b = faxios.create({ env: { fetch: respecting.fetch } }).use(retry({ delay: 100, jitter: "none", respectRetryAfter: false }))
        .get(URL, { retry: { respectRetryAfter: true } });
      assert.strictEqual(await callsAfter(ignoring.calls, 100), 2);
      assert.strictEqual(await callsAfter(respecting.calls, 1899), 1);
      assert.strictEqual(await callsAfter(respecting.calls, 1), 2);
      await Promise.all([ a, b ]);
    });

    it("caps the computed backoff at maxDelay (default 30 seconds)", async () => {
      const capped = scriptedFetch([ 503, 200 ]);
      const byDefault = scriptedFetch([ 503, 200 ]);

      const a = faxios.create({ env: { fetch: capped.fetch } }).use(retry({ delay: 10_000, maxDelay: 1000, jitter: "none" }))
        .get(URL);
      const b = faxios.create({ env: { fetch: byDefault.fetch } }).use(retry({ delay: () => 60_000, jitter: "none" }))
        .get(URL);
      assert.strictEqual(await callsAfter(capped.calls, 999), 1);
      assert.strictEqual(await callsAfter(capped.calls, 1), 2);
      assert.strictEqual(await callsAfter(byDefault.calls, 29_000 - 1), 1);
      assert.strictEqual(await callsAfter(byDefault.calls, 1), 2);
      await Promise.all([ a, b ]);
    });

    it("applies full jitter to the capped backoff by default", async () => {
      vi.mocked(Math.random).mockReturnValue(0.25);
      const { fetch, calls } = scriptedFetch([ 503, 200 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 10_000, maxDelay: 1000 }));

      const request = api.get(URL);
      assert.strictEqual(await callsAfter(calls, 249), 1);
      assert.strictEqual(await callsAfter(calls, 1), 2);
      await request;
    });

    it("calls onRetry with the error, the try that failed and the wait, before waiting", async () => {
      const { fetch, calls } = scriptedFetch([ 503, { status: 429, headers: { "Retry-After": "1" } }, 200 ]);
      const seen: Array<[ number | undefined, number, number, number ]> = [];
      const api = faxios.create({ env: { fetch } }).use(retry({
        delay: 100,
        onRetry: (error, attempt, delayMs) => {
          seen.push([ error instanceof FaxiosError ? error.response?.status : undefined, attempt, delayMs, calls.length ]);
        },
      }));

      const request = api.get(URL);
      await vi.runAllTimersAsync();
      await request;

      assert.deepStrictEqual(seen, [[ 503, 1, 50, 1 ], [ 429, 2, 1000, 2 ]]);
    });

    it("rejects with onRetry's error and stops retrying when onRetry throws", async () => {
      const { fetch, calls } = scriptedFetch([ 503, 200 ]);
      const hookError = new Error("stop");
      const api = faxios.create({ env: { fetch } }).use(retry({
        delay: 0,
        onRetry: () => {
          throw hookError;
        },
      }));

      const request = assert.rejects(api.get(URL), hookError);
      await vi.runAllTimersAsync();
      await request;

      assert.strictEqual(calls.length, 1);
    });

    it("checks `methods` before the statuses", async () => {
      const { fetch, calls } = scriptedFetch([ 503, 200 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0, statuses: [ 503 ] }));

      await rejectsWithTimers(api.post(URL, {}), isStatus(503));

      assert.strictEqual(calls.length, 1);
    });
  });

  describe("option validation", () => {
    const isBadValue = (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION_VALUE;
    const isUnknown = (err: unknown) => err instanceof FaxiosError && err.code === FaxiosError.ERR_BAD_OPTION;

    it("rejects invalid options when the plugin is created", () => {
      for (const attempts of [ Number.NaN, 0, -1, 1.5, Number.POSITIVE_INFINITY ]) {
        assert.throws(() => retry({ attempts }), isBadValue, `attempts: ${attempts}`);
      }
      for (const delay of [ Number.NaN, -1, Number.POSITIVE_INFINITY ]) {
        assert.throws(() => retry({ delay }), isBadValue, `delay: ${delay}`);
      }
      // @ts-expect-error TS2322 -- retryOn must be a function
      assert.throws(() => retry({ retryOn: true }), isBadValue);
      // @ts-expect-error TS2322 -- methods must be an array of method names
      assert.throws(() => retry({ methods: "post" }), isBadValue);
      // @ts-expect-error TS2353 -- unknown option
      assert.throws(() => retry({ retries: 3 }), isUnknown);
      // @ts-expect-error TS2345 -- null isn't an options object
      assert.throws(() => retry(null), isBadValue);
      for (const statuses of [[ 99 ], [ 600 ], [ 503.5 ], [ Number.NaN ], [ "503" ], "503" ]) {
        // @ts-expect-error TS2322 -- statuses must be an array of status codes
        assert.throws(() => retry({ statuses }), isBadValue, `statuses: ${JSON.stringify(statuses)}`);
      }
      for (const ms of [ Number.NaN, -1, Number.POSITIVE_INFINITY ]) {
        assert.throws(() => retry({ maxDelay: ms }), isBadValue, `maxDelay: ${ms}`);
        assert.throws(() => retry({ maxRetryAfter: ms }), isBadValue, `maxRetryAfter: ${ms}`);
      }
      for (const ms of [ 2 ** 31, 30 * 24 * 60 * 60 * 1000 ]) {
        assert.throws(() => retry({ maxDelay: ms }), (err: unknown) => isBadValue(err) && (err as Error).message.includes("maxDelay"), `maxDelay: ${ms}`);
        assert.throws(() => retry({ maxRetryAfter: ms }), (err: unknown) => isBadValue(err) && (err as Error).message.includes("maxRetryAfter"), `maxRetryAfter: ${ms}`);
      }
      assert.doesNotThrow(() => retry({ maxDelay: 2_147_483_647, maxRetryAfter: 2_147_483_647 }));
      for (const attemptTimeout of [ Number.NaN, -1, Number.POSITIVE_INFINITY, 2 ** 31 ]) {
        assert.throws(() => retry({ attemptTimeout }), (err: unknown) => isBadValue(err) && (err as Error).message.includes("attemptTimeout"), `attemptTimeout: ${attemptTimeout}`);
      }
      // @ts-expect-error TS2322 -- attemptTimeout is a number of milliseconds
      assert.throws(() => retry({ attemptTimeout: "50" }), isBadValue);
      assert.doesNotThrow(() => retry({ attemptTimeout: 0 }));
      // @ts-expect-error TS2322 -- jitter is "full" or "none"
      assert.throws(() => retry({ jitter: "half" }), isBadValue);
      // @ts-expect-error TS2322 -- onRetry must be a function
      assert.throws(() => retry({ onRetry: true }), isBadValue);
      // @ts-expect-error TS2322 -- respectRetryAfter must be a boolean
      assert.throws(() => retry({ respectRetryAfter: "no" }), isBadValue);
    });

    it("rejects invalid policy options per request before sending anything", async () => {
      const { fetch, calls } = scriptedFetch([ 503 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

      await assert.rejects(api.get(URL, { retry: { statuses: [ 600 ] } }), isBadValue);
      await assert.rejects(api.get(URL, { retry: { maxDelay: -1 } }), isBadValue);
      await assert.rejects(api.get(URL, { retry: { maxRetryAfter: Number.NaN } }), isBadValue);
      await assert.rejects(api.get(URL, { retry: { maxRetryAfter: 2 ** 31 } }), isBadValue);
      // @ts-expect-error TS2769 -- jitter is "full" or "none"
      await assert.rejects(api.get(URL, { retry: { jitter: "some" } }), isBadValue);
      // @ts-expect-error TS2769 -- respectRetryAfter must be a boolean
      await assert.rejects(api.get(URL, { retry: { respectRetryAfter: 0 } }), isBadValue);

      assert.strictEqual(calls.length, 0);
    });

    it("rejects empty or non-token method names, from the plugin or per request", async () => {
      const { fetch, calls } = scriptedFetch([ 503 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

      for (const method of [ "", "GET POST", "get\n", "pó", "(get)" ]) {
        assert.throws(() => retry({ methods: [ method as Method ] }), isBadValue, `methods: ${JSON.stringify(method)}`);
        await assert.rejects(api.get(URL, { retry: { methods: [ method as Method ] } }), isBadValue, `per request: ${JSON.stringify(method)}`);
      }
      assert.doesNotThrow(() => retry({ methods: [ "M-SEARCH", "x_custom!" ] as Array<string> as Array<Method> }));

      assert.strictEqual(calls.length, 0);
    });

    it("rejects an invalid per-request override before sending anything", async () => {
      const { fetch, calls } = scriptedFetch([ 503 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

      await assert.rejects(api.get(URL, { retry: { attempts: Number.NaN } }), isBadValue);
      await assert.rejects(api.get(URL, { retry: { attempts: Number.POSITIVE_INFINITY } }), isBadValue);
      await assert.rejects(api.get(URL, { retry: { delay: -5 } }), isBadValue);
      // @ts-expect-error TS2769 -- per-request retry must be false or an options object
      await assert.rejects(api.get(URL, { retry: true }), isBadValue);
      // @ts-expect-error TS2769 -- null isn't an options object either
      await assert.rejects(api.get(URL, { retry: null }), isBadValue);

      assert.strictEqual(calls.length, 0);
    });

    it("accepts at most 10 attempts, from the plugin or per request", async () => {
      const isAttemptsBound = (err: unknown) => isBadValue(err) && (err as Error).message.includes("attempts");
      assert.throws(() => retry({ attempts: 11 }), isAttemptsBound);
      assert.throws(() => retry({ attempts: Number.MAX_SAFE_INTEGER }), isAttemptsBound);

      const { fetch, calls } = scriptedFetch([ 503 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ attempts: 10, delay: 0 }));
      await assert.rejects(api.get(URL, { retry: { attempts: 11 } }), isAttemptsBound);
      assert.strictEqual(calls.length, 0);

      const request = assert.rejects(api.get(URL), isStatus(503));
      await vi.runAllTimersAsync();
      await request;
      assert.strictEqual(calls.length, 10);

      const overridden = assert.rejects(api.get(URL, { retry: { attempts: 10 } }), isStatus(503));
      await vi.runAllTimersAsync();
      await overridden;
      assert.strictEqual(calls.length, 20);
    });

    it("rejects a delay function that returns an invalid wait", async () => {
      const { fetch, calls } = scriptedFetch([ 503, 200 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: () => Number.NaN }));

      await assert.rejects(api.get(URL), isBadValue);

      assert.strictEqual(calls.length, 1);
    });
  });
});
