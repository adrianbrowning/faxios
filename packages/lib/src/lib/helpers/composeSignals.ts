import canceledFromSignal from "../cancel/canceledFromSignal.js";
import utils from "../utils.js";

type AbortHandler = (this: AbortSignal & { reason?: unknown; }, reason: unknown) => void;
type EventListenerFn = (event: unknown) => void;
type SignalLike = {
  aborted: boolean;
  addEventListener: (type: string, listener: EventListenerFn) => void;
  reason?: unknown;
  removeEventListener: (type: string, listener: EventListenerFn) => void;
  unsubscribe?: (() => void) | ((handler: AbortHandler) => void);
};
export type ExtendedAbortSignal = AbortSignal & { unsubscribe?: (() => void) | ((handler: AbortHandler) => void); };

const composeSignals = (signals: Array<unknown> | null | undefined): ExtendedAbortSignal | undefined => {
  let activeSignals: Array<SignalLike> | null = signals ? (signals.filter(Boolean) as Array<SignalLike>) : [];

  if (!activeSignals.length) {
    return;
  }

  const controller = new AbortController();

  let aborted = false;

  const onabort: AbortHandler = function (this: AbortSignal & { reason?: unknown; }, reason: unknown) {
    if (!aborted) {
      aborted = true;
      unsubscribe();
      const err = reason instanceof Error ? reason : this.reason;
      controller.abort(canceledFromSignal({ aborted: true, reason: err }));
    }
  };

  const unsubscribe = () => {
    if (!activeSignals) { return; }
    activeSignals.forEach(signal => {
      signal.unsubscribe
        ? (signal.unsubscribe)(onabort)
        : signal.removeEventListener("abort", onabort);
    });
    activeSignals = null;
  };

  // An already-aborted input never fires "abort" again, so propagate it now.
  for (const signal of activeSignals) {
    if (signal.aborted) {
      onabort.call(signal as unknown as AbortSignal, signal.reason);
      break;
    }
    signal.addEventListener("abort", onabort);
  }

  const { signal } = controller;

  (signal as ExtendedAbortSignal).unsubscribe = () => utils.asap(unsubscribe);

  return signal;
};

export default composeSignals;
