import canceledFromSignal from "../cancel/canceledFromSignal.js";
import { onAbort } from "./raceAbort.js";
import type { AbortableSignal } from "./raceAbort.js";

export type ExtendedAbortSignal = AbortSignal & { unsubscribe?: () => void; };

/**
 * One signal that aborts when the first of `signals` does, with that input's reason as a
 * `CanceledError`. Its `unsubscribe()` removes every listener on the inputs, on the next microtask.
 */
const composeSignals = (signals: Array<unknown> | null | undefined): ExtendedAbortSignal | undefined => {
  const inputs = signals ? (signals.filter(Boolean) as Array<AbortableSignal & { reason?: unknown; }>) : [];

  if (!inputs.length) {
    return;
  }

  const controller = new AbortController();
  let stops: Array<() => void> = [];

  const unsubscribe = () => {
    for (const stop of stops) stop();
    stops = [];
  };

  // An already-aborted input aborts the result at once; the inputs after it aren't watched.
  for (const input of inputs) {
    stops.push(onAbort(input, () => {
      unsubscribe();
      controller.abort(canceledFromSignal({ aborted: true, reason: input.reason }));
    }));
    if (controller.signal.aborted) break;
  }

  const signal: ExtendedAbortSignal = controller.signal;
  signal.unsubscribe = () => queueMicrotask(unsubscribe);

  return signal;
};

export default composeSignals;
