import assert from "node:assert";
import { getEventListeners } from "node:events";
import { describe, it } from "vitest";
import raceAbort, { onAbort } from "#src/lib/helpers/raceAbort.js";

const aborted = () => new Error("aborted");
const listeners = (signal: AbortSignal) => getEventListeners(signal, "abort").length;

describe("helpers::raceAbort", () => {
  it("rejects without calling run when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let ran = false;

    await assert.rejects(raceAbort(controller.signal, () => {
      ran = true;
    }, aborted), { message: "aborted" });
    assert.strictEqual(ran, false);
    assert.strictEqual(listeners(controller.signal), 0);
  });

  it("resolves with run's result and removes its listener", async () => {
    const controller = new AbortController();

    assert.strictEqual(await raceAbort(controller.signal, async () => "done", aborted), "done");
    assert.strictEqual(listeners(controller.signal), 0);
  });

  it("rejects with run's error and removes its listener", async () => {
    const controller = new AbortController();

    await assert.rejects(raceAbort(controller.signal, async () => Promise.reject(new Error("failed")), aborted), { message: "failed" });
    assert.strictEqual(listeners(controller.signal), 0);
  });

  it("turns a synchronous throw into a rejection and removes its listener", async () => {
    const controller = new AbortController();

    await assert.rejects(raceAbort(controller.signal, () => {
      throw new Error("thrown");
    }, aborted), { message: "thrown" });
    assert.strictEqual(listeners(controller.signal), 0);
  });

  it("rejects at once when the signal aborts while run is pending, and removes its listener", async () => {
    const controller = new AbortController();
    const { promise: gate, resolve: open } = Promise.withResolvers<string>();

    const race = raceAbort(controller.signal, async () => gate, aborted);
    controller.abort();
    await assert.rejects(race, { message: "aborted" });
    assert.strictEqual(listeners(controller.signal), 0);
    open("late");
  });

  it("sees an abort from run's synchronous part", async () => {
    const controller = new AbortController();
    const { promise: gate } = Promise.withResolvers<void>();

    await assert.rejects(raceAbort(controller.signal, async () => {
      controller.abort();
      return gate;
    }, aborted), { message: "aborted" });
  });

  it("consumes a rejection that loses the race", async () => {
    const controller = new AbortController();
    const { promise: gate, reject: fail } = Promise.withResolvers<void>();
    const unhandled: Array<unknown> = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const race = raceAbort(controller.signal, async () => gate, aborted);
      controller.abort();
      await assert.rejects(race, { message: "aborted" });
      fail(new Error("late failure"));
      // Unhandled rejections are reported after the microtask queue drains.
      await new Promise(resolve => setImmediate(resolve));
      assert.deepStrictEqual(unhandled, []);
    }
    finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("helpers::onAbort", () => {
  it("calls the listener once on abort and removes it", () => {
    const controller = new AbortController();
    let calls = 0;

    onAbort(controller.signal, () => calls++);
    assert.strictEqual(listeners(controller.signal), 1);
    controller.abort();
    assert.strictEqual(calls, 1);
    assert.strictEqual(listeners(controller.signal), 0);
  });

  it("calls the listener at once for an aborted signal, adding none", () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;

    onAbort(controller.signal, () => calls++);
    assert.strictEqual(calls, 1);
    assert.strictEqual(listeners(controller.signal), 0);
  });

  it("returns what removes the listener before an abort", () => {
    const controller = new AbortController();
    let calls = 0;

    const stop = onAbort(controller.signal, () => calls++);
    stop();
    controller.abort();
    assert.strictEqual(calls, 0);
    assert.strictEqual(listeners(controller.signal), 0);
  });
});
