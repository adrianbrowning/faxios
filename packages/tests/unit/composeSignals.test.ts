import assert from "node:assert";
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

  runIfAbortController("should abort on timeout", async () => {
    const signal = composeSignals([], 100)!;

    await new Promise(resolve => {
      signal.addEventListener("abort", resolve);
    });

    assert.match(String(signal.reason), /timeout of 100ms exceeded/);
  });

  it("should return undefined if signals and timeout are not provided", () => {
    const signal = composeSignals([]);

    assert.strictEqual(signal, undefined);
  });
});
