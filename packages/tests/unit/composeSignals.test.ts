import assert from "node:assert";
import { getEventListeners } from "node:events";
import { describe, it } from "vitest";
import CanceledError from "#src/lib/cancel/CanceledError.js";
import composeSignals from "#src/lib/helpers/composeSignals.js";

describe("helpers::composeSignals", () => {
  const runIfAbortController =
    typeof AbortController === "function" ? it : it.skip;

  runIfAbortController("should abort when any of the signals abort", () => {
    let called;

    const controllerA = new AbortController();
    const controllerB = new AbortController();

    const signal = composeSignals([ controllerA.signal, controllerB.signal ])!;

    signal.addEventListener("abort", () => {
      called = true;
    });

    controllerA.abort(new Error("test"));

    assert.ok(called);
  });

  runIfAbortController("takes the reason of a later input that aborts", () => {
    const first = new AbortController();
    const second = new AbortController();
    const third = new AbortController();

    const signal = composeSignals([ first.signal, second.signal, third.signal ])!;
    assert.strictEqual(signal.aborted, false);
    third.abort(new Error("third"));

    assert.strictEqual(signal.aborted, true);
    assert.ok(signal.reason instanceof CanceledError);
    assert.strictEqual(signal.reason.message, "third");
  });

  runIfAbortController("should abort immediately when a signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort(new Error("already aborted"));

    const signal = composeSignals([ controller.signal ])!;

    assert.strictEqual(signal.aborted, true);
    assert.ok(signal.reason instanceof CanceledError);
    assert.strictEqual(signal.reason.message, "already aborted");
  });

  runIfAbortController("should keep the first input's reason when an earlier input is already aborted", () => {
    const first = new AbortController();
    const second = new AbortController();
    first.abort(new Error("first"));

    const signal = composeSignals([ first.signal, second.signal ])!;
    second.abort(new Error("second"));

    assert.strictEqual(signal.aborted, true);
    assert.strictEqual((signal.reason as CanceledError).message, "first");
  });

  runIfAbortController("removes its listeners from every input on unsubscribe", async () => {
    const first = new AbortController();
    const second = new AbortController();

    const signal = composeSignals([ first.signal, second.signal ])!;
    assert.strictEqual(getEventListeners(first.signal, "abort").length, 1);
    signal.unsubscribe!();
    // Removal is deferred to a microtask.
    await Promise.resolve();

    assert.strictEqual(getEventListeners(first.signal, "abort").length, 0);
    assert.strictEqual(getEventListeners(second.signal, "abort").length, 0);
  });

  runIfAbortController("removes its listeners from every input once one aborts", () => {
    const first = new AbortController();
    const second = new AbortController();

    composeSignals([ first.signal, second.signal ]);
    second.abort(new Error("second"));

    assert.strictEqual(getEventListeners(first.signal, "abort").length, 0);
    assert.strictEqual(getEventListeners(second.signal, "abort").length, 0);
  });

  runIfAbortController("adds no listener after an input that is already aborted", () => {
    const first = new AbortController();
    const second = new AbortController();
    first.abort(new Error("first"));

    composeSignals([ first.signal, second.signal ]);

    assert.strictEqual(getEventListeners(second.signal, "abort").length, 0);
  });

  it("should return undefined when no signal is provided", () => {
    const signal = composeSignals([]);

    assert.strictEqual(signal, undefined);
  });
});
