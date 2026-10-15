import { afterEach, describe, expect, it, vi } from "vitest";
import { progressReporter } from "#src/lib/helpers/progressEventReducer.js";
import type { FaxiosProgressEvent } from "#src/lib/types.js";

// Listeners run on a queued microtask; awaiting one more lets those queued earlier run first.
const settle = async () => {
  await Promise.resolve();
};

describe("helpers::progressReporter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses counts inside one throttle window and flush emits the last one", async () => {
    vi.useFakeTimers({ toFake: [ "setTimeout", "clearTimeout", "Date" ] });
    const loaded: Array<number> = [];
    // 10 events a second: one per 100 ms window.
    const [ report, flush ] = progressReporter(data => {
      loaded.push(data.loaded);
    }, 100, false, 10);

    report(10);
    report(20);
    report(30);
    await settle();
    expect(loaded).toEqual([ 10 ]);

    flush();
    await settle();
    expect(loaded).toEqual([ 10, 30 ]);

    // A count inside the window flush opened waits for the window to end.
    report(40);
    vi.advanceTimersByTime(99);
    await settle();
    expect(loaded).toEqual([ 10, 30 ]);
    vi.advanceTimersByTime(1);
    await settle();
    expect(loaded).toEqual([ 10, 30, 40 ]);
  });

  it("takes byte counts, clamps loaded/progress and avoids negative bytes for out-of-order counts", async () => {
    const events: Array<FaxiosProgressEvent> = [];
    const [ report, flush ] = progressReporter(data => {
      events.push(data);
    }, 100, false, Number.POSITIVE_INFINITY);

    report(80);
    report(60);
    report(180);
    flush();
    await settle();

    expect(events.length).toBe(3);
    expect(events[0]!.bytes).toBe(80);
    expect(events[1]!.bytes).toBe(0);

    const last = events[events.length - 1]!;
    expect(last.loaded).toBe(100);
    expect(last.total).toBe(100);
    expect(last.progress).toBe(1);
    expect(last.upload).toBe(true);
    expect(last.bytes).toBe(20);
  });

  it("reports an unknown total as not length-computable, with no event key", async () => {
    const events: Array<FaxiosProgressEvent> = [];
    const [ report ] = progressReporter(data => {
      events.push(data);
    }, undefined, true, Number.POSITIVE_INFINITY);

    report(50);
    await settle();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ loaded: 50, bytes: 50, lengthComputable: false, download: true });
    expect(events[0]!.total).toBeUndefined();
    expect(Object.hasOwn(events[0]!, "event")).toBe(false);
  });

  it("ignores a listener that throws or rejects", async () => {
    const [ report ] = progressReporter(() => {
      throw new Error("listener");
    }, 10, false, Number.POSITIVE_INFINITY);
    const [ reportAsync ] = progressReporter(async () => {
      throw new Error("listener");
    }, 10, false, Number.POSITIVE_INFINITY);

    report(5);
    reportAsync(5);
    await settle();
  });
});
