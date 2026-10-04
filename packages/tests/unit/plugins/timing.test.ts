import assert from "node:assert";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import faxios, { FaxiosError, retry, timing } from "#src/index.ts";
import type { TimingEvent } from "#src/index.ts";

const URL = "http://localhost/timing";

// Resolves `ms` of (fake) time after it's called.
const slowFetch = (ms: number, status = 200) => async () => new Promise<Response>(resolve => {
  setTimeout(() => resolve(new Response(null, { status })), ms);
});

describe("plugins::timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the duration and status of a successful request", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ env: { fetch: slowFetch(25) } }).use(timing(event => events.push(event)));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(25);
    const response = await request;

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]!.durationMs, 25);
    assert.strictEqual(events[0]!.status, 200);
    assert.strictEqual(events[0]!.error, undefined);
    assert.strictEqual(events[0]!.config.url, URL);
    assert.strictEqual(response.status, 200);
  });

  it("reports the duration and error of a failed request, then rethrows it", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ env: { fetch: slowFetch(40, 500) } }).use(timing(event => events.push(event)));

    const request = assert.rejects(api.get(URL), (err: unknown) => err instanceof FaxiosError && err.response?.status === 500);
    await vi.advanceTimersByTimeAsync(40);
    await request;

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]!.durationMs, 40);
    assert.strictEqual(events[0]!.status, undefined);
    assert.ok(events[0]!.error instanceof FaxiosError);
  });

  it("measures every try together when installed before retry", async () => {
    const events: Array<TimingEvent> = [];
    let calls = 0;
    const fetch = async () => {
      calls++;
      return slowFetch(10, calls === 1 ? 503 : 200)();
    };
    const api = faxios.create({ env: { fetch } }).use(timing(event => events.push(event)))
      .use(retry({ delay: 5 }));

    const request = api.get(URL);
    await vi.advanceTimersByTimeAsync(25);
    await request;

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]!.durationMs, 25);
  });
});
