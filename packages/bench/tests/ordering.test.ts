// faxios middleware order changes what timing measures: installed before retry it times the
// whole request, every attempt and wait included; installed after retry it times each attempt.
import faxios from "faxios";
import { retry } from "faxios/plugins/retry";
import { timing } from "faxios/plugins/timing";
import type { TimingEvent } from "faxios/plugins/timing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reply = (status: number) => Response.json({ status }, { status });

describe("faxios timing and retry order", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: [ "setTimeout", "clearTimeout", "Date", "performance" ] });
    let calls = 0;
    vi.stubGlobal("fetch", async () => (++calls < 3 ? reply(503) : reply(200)));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("times the whole request, waits included, when timing is installed first", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: "http://bench.test" })
      .use(timing(event => events.push(event)))
      .use(retry({ jitter: "none" }));
    const response = api.get("/users/u1");
    await vi.advanceTimersByTimeAsync(300);
    await expect(response).resolves.toMatchObject({ status: 200 });
    expect(events).toEqual([ expect.objectContaining({ attempt: 3, status: 200, durationMs: 300 }) ]);
  });

  it("times each attempt when timing is installed after retry", async () => {
    const events: Array<TimingEvent> = [];
    const api = faxios.create({ baseURL: "http://bench.test" })
      .use(retry({ jitter: "none" }))
      .use(timing(event => events.push(event)));
    const response = api.get("/users/u1");
    await vi.advanceTimersByTimeAsync(300);
    await expect(response).resolves.toMatchObject({ status: 200 });
    expect(events.map(e => [ e.attempt, e.status ?? e.error.status, e.durationMs ])).toEqual([ [ 1, 503, 0 ], [ 2, 503, 0 ], [ 3, 200, 0 ] ]);
  });
});
