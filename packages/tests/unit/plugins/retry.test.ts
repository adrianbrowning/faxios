import assert from "node:assert";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import faxios, { CanceledError, FaxiosError, retry } from "#src/index.ts";

const URL = "http://localhost/retry";

type Reply = number | "network";

// A fetch that plays back one reply per call and records how many calls it saw.
function scriptedFetch(replies: Array<Reply>) {
  const calls: Array<RequestInit | undefined> = [];
  const fetch = async (_input: Request | string | URL, init?: RequestInit) => {
    calls.push(init);
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    if (reply === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ attempt: calls.length }), { status: reply, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, calls };
}

const isStatus = (status: number) => (err: unknown) => err instanceof FaxiosError && err.response?.status === status;

describe("plugins::retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries network errors and 5xx responses until one succeeds", async () => {
    const { fetch, calls } = scriptedFetch([ "network", 503, 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ attempts: 3, delay: 10 }));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    const response = await request;

    assert.strictEqual(calls.length, 3);
    assert.deepStrictEqual(response.data, { attempt: 3 });
  });

  it("waits the delay before each retry, doubling by default", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 503, 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry());

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

    await assert.rejects(api.get(URL), isStatus(404));

    assert.strictEqual(calls.length, 1);
  });

  it("retries timeouts", async () => {
    let calls = 0;
    const fetch = async (input: Request | string | URL, init?: RequestInit) => {
      calls++;
      if (calls > 1) return Promise.resolve(new Response(null, { status: 200 }));
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    };
    const api = faxios.create({ env: { fetch }, timeout: 50 }).use(retry({ delay: 0 }));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();
    const response = await request;

    assert.strictEqual(calls, 2);
    assert.strictEqual(response.status, 200);
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

    await assert.rejects(offApi.get(URL, { retry: false }), isStatus(503));
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
    controller.abort();
    await request;
    await vi.runAllTimersAsync();

    assert.strictEqual(calls.length, 1);
  });

  it("never retries a request the caller canceled", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch, calls } = scriptedFetch([ 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

    await assert.rejects(api.get(URL, { signal: controller.signal }), (err: unknown) => err instanceof CanceledError);

    assert.strictEqual(calls.length, 0);
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

    await assert.rejects(api.post(URL, body), isStatus(503));

    assert.strictEqual(calls.length, 1);
  });

  it("does not retry a Node stream body", async () => {
    const { fetch, calls } = scriptedFetch([ 503, 200 ]);
    const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

    await assert.rejects(api.post(URL, Readable.from([ "chunk" ])), isStatus(503));

    assert.strictEqual(calls.length, 1);
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
      // @ts-expect-error -- retryOn must be a function
      assert.throws(() => retry({ retryOn: true }), isBadValue);
      // @ts-expect-error -- unknown option
      assert.throws(() => retry({ retries: 3 }), isUnknown);
      // @ts-expect-error -- null isn't an options object
      assert.throws(() => retry(null), isBadValue);
    });

    it("rejects an invalid per-request override before sending anything", async () => {
      const { fetch, calls } = scriptedFetch([ 503 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: 0 }));

      await assert.rejects(api.get(URL, { retry: { attempts: Number.NaN } }), isBadValue);
      await assert.rejects(api.get(URL, { retry: { attempts: Number.POSITIVE_INFINITY } }), isBadValue);
      await assert.rejects(api.get(URL, { retry: { delay: -5 } }), isBadValue);
      // @ts-expect-error -- per-request retry must be false or an options object
      await assert.rejects(api.get(URL, { retry: true }), isBadValue);
      // @ts-expect-error -- null isn't an options object either
      await assert.rejects(api.get(URL, { retry: null }), isBadValue);

      assert.strictEqual(calls.length, 0);
    });

    it("rejects a delay function that returns an invalid wait", async () => {
      const { fetch, calls } = scriptedFetch([ 503, 200 ]);
      const api = faxios.create({ env: { fetch } }).use(retry({ delay: () => Number.NaN }));

      await assert.rejects(api.get(URL), isBadValue);

      assert.strictEqual(calls.length, 1);
    });
  });
});
