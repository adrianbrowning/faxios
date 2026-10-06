import assert from "node:assert";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import faxios, { FaxiosError } from "#src/index.ts";
import { authBearer } from "#src/lib/plugins/authBearer.ts";
import { retry } from "#src/lib/plugins/retry.ts";
import { timing } from "#src/lib/plugins/timing.ts";
import type { TimingEvent } from "#src/lib/plugins/timing.ts";

const BASE = "http://localhost";
const URL = "/timing";

// Resolves `ms` of (fake) time after it's called.
const slowFetch = (ms: number, status = 200) => async () => new Promise<Response>(resolve => {
  setTimeout(() => resolve(new Response(null, { status })), ms);
});

// Fails with the given statuses in turn, each after `ms`, then succeeds.
function flakyFetch(ms: number, statuses: Array<number>) {
  let calls = 0;
  return async () => slowFetch(ms, statuses[calls++] ?? 200)();
}

describe("plugins::timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the method, URL, duration and status of a successful request", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: slowFetch(25) } }).use(timing(event => events.push(event)));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(25);
    const response = await request;

    assert.deepStrictEqual(events, [{ method: "GET", url: "http://localhost/timing", durationMs: 25, status: 200 }]);
    assert.strictEqual(response.status, 200);
  });

  it("reports the method, URL, duration and error of a failed request, then rethrows it", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: slowFetch(40, 500) } }).use(timing(event => events.push(event)));

    const request = assert.rejects(api.post(URL, { a: 1 }), (err: unknown) => err instanceof FaxiosError && err.response?.status === 500);
    await vi.advanceTimersByTimeAsync(40);
    await request;

    assert.strictEqual(events.length, 1);
    const { error, ...rest } = events[0]!;
    assert.deepStrictEqual(rest, { method: "POST", url: "http://localhost/timing", durationMs: 40 });
    assert.ok(error instanceof FaxiosError);
  });

  it("strips the query string and fragment from the URL", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: `${BASE}/v1`, env: { fetch: slowFetch(0) } }).use(timing(event => events.push(event)));

    const request = api.get("/items/7?token=secret#section", { params: { apiKey: "secret" } });
    await vi.runAllTimersAsync();
    await request;

    assert.strictEqual(events[0]!.url, "http://localhost/v1/items/7");
  });

  it("reports a path-param URL by its template, not the substituted path", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: slowFetch(0) } }).use(timing(event => events.push(event)));

    const request = api.get("/users/:id", { pathParams: { id: "7" } });
    await vi.runAllTimersAsync();
    await request;

    assert.strictEqual(events[0]!.url, "http://localhost/users/:id");
  });

  it("passes no config, headers or body to onTiming", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: slowFetch(0) } })
      .use(authBearer(() => "secret-token"))
      .use(timing(event => events.push(event)));

    const request = api.post(URL, { password: "secret-body" }, { headers: { "X-Secret": "secret-header" } });
    await vi.runAllTimersAsync();
    await request;

    assert.deepStrictEqual(Object.keys(events[0]!).sort(), [ "durationMs", "method", "status", "url" ]);
    assert.ok(!JSON.stringify(events[0]).includes("secret"));
  });

  it("reports each try's number when installed after retry", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: flakyFetch(10, [ 503 ]) } })
      .use(retry({ delay: 5, jitter: "none" }))
      .use(timing(event => events.push(event)));

    const request = api.get(URL);
    await vi.runAllTimersAsync();
    await request;

    assert.deepStrictEqual(events.map(({ attempt, status }) => ({ attempt, status })), [
      { attempt: 1, status: undefined },
      { attempt: 2, status: 200 },
    ]);
  });

  it("measures every try together, with the final try's number, when installed before retry", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: flakyFetch(10, [ 503 ]) } })
      .use(timing(event => events.push(event)))
      .use(retry({ delay: 5, jitter: "none" }));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(25);
    await request;

    assert.deepStrictEqual(events, [{ method: "GET", url: "http://localhost/timing", attempt: 2, durationMs: 25, status: 200 }]);
  });

  it("leaves attempt out without retry", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: slowFetch(0) } }).use(timing(event => events.push(event)));

    const request = api.get(URL);
    await vi.runAllTimersAsync();
    await request;

    assert.strictEqual(Object.hasOwn(events[0]!, "attempt"), false);
  });

  it("rejects with the request's own error even when onTiming throws on a failure", async () => {
    const api = faxios.create({ baseURL: BASE, env: { fetch: slowFetch(10, 500) } }).use(timing(() => {
      throw new Error("metrics backend down");
    }));

    const request = assert.rejects(api.get(URL), (err: unknown) => err instanceof FaxiosError && err.response?.status === 500);
    await vi.advanceTimersByTimeAsync(10);
    await request;
  });

  it("rejects with onTiming's error when it throws while reporting a success", async () => {
    const observerError = new Error("metrics backend down");
    const api = faxios.create({ baseURL: BASE, env: { fetch: slowFetch(10) } }).use(timing(() => {
      throw observerError;
    }));

    const request = assert.rejects(api.get(URL), observerError);
    await vi.advanceTimersByTimeAsync(10);
    await request;
  });

  it("reports each try's outcome and duration separately when installed after retry", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: BASE, env: { fetch: flakyFetch(10, [ 503 ]) } })
      .use(retry({ delay: 0 }))
      .use(timing(event => events.push(event)));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(30);
    await request;

    assert.strictEqual(events.length, 2);
    assert.ok(events[0]!.error instanceof FaxiosError);
    assert.strictEqual(events[0]!.error.response?.status, 503);
    assert.strictEqual(events[0]!.status, undefined);
    assert.strictEqual(events[1]!.error, undefined);
    assert.strictEqual(events[1]!.status, 200);
    assert.strictEqual(events[0]!.durationMs, 10);
    assert.strictEqual(events[1]!.durationMs, 10);
  });
});
