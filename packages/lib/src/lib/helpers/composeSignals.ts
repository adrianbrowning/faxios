import CanceledError from "../cancel/CanceledError.js";
import FaxiosError from "../core/FaxiosError.js";
import utils from "../utils.js";

type AbortHandler = (this: AbortSignal & { reason?: unknown; }, reason: unknown) => void;
type EventListenerFn = (event: unknown) => void;
type SignalLike = {
  unsubscribe?: (() => void) | ((handler: AbortHandler) => void);
  addEventListener: (type: string, listener: EventListenerFn) => void;
  removeEventListener: (type: string, listener: EventListenerFn) => void;
  aborted: boolean;
  reason?: unknown;
};
export type ExtendedAbortSignal = AbortSignal & { unsubscribe?: (() => void) | ((handler: AbortHandler) => void); };

const composeSignals = (signals: Array<unknown> | null | undefined, timeout?: number, timeoutMessage?: string): ExtendedAbortSignal | undefined => {
  let activeSignals: Array<SignalLike> | null = signals ? (signals.filter(Boolean) as Array<SignalLike>) : [];

  if (!timeout && !activeSignals.length) {
    return;
  }

  const controller = new AbortController();

  let aborted = false;

  const onabort: AbortHandler = function (this: AbortSignal & { reason?: unknown; }, reason: unknown) {
    if (!aborted) {
      aborted = true;
      unsubscribe();
      const err = reason instanceof Error ? reason : this.reason;
      const errMsg = err instanceof Error ? err.message : (err as string | undefined);
      const abortErr = err instanceof FaxiosError ? err : new CanceledError(errMsg, undefined, undefined);
      controller.abort(abortErr);
    }
  };

  let timer: ReturnType<typeof setTimeout> | null =
    timeout
      ? setTimeout(() => {
        timer = null;
        onabort.call(controller.signal, new FaxiosError(timeoutMessage || `timeout of ${timeout}ms exceeded`, FaxiosError.ETIMEDOUT));
      }, timeout)
      : null;

  const unsubscribe = () => {
    if (!activeSignals) { return; }
    if (timer) { clearTimeout(timer); }
    timer = null;
    activeSignals.forEach(signal => {
      signal.unsubscribe
        ? (signal.unsubscribe)(onabort)
        : signal.removeEventListener("abort", onabort);
    });
    activeSignals = null;
  };

  activeSignals.forEach(signal => signal.addEventListener("abort", onabort));

  const { signal } = controller;

  (signal as ExtendedAbortSignal).unsubscribe = () => utils.asap(unsubscribe);

  return signal;
};

export default composeSignals;
