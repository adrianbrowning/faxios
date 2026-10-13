import type { GenericAbortSignal, InternalFaxiosRequestConfig } from "../types.js";
import FaxiosError from "./FaxiosError.js";

export type RequestDeadline = {
  /**
   * Stops the timer and unhooks the caller's signal once the request settles, unless a stream
   * body still being read holds the deadline (see holdDeadline).
   */
  settle: () => void;
  /** Aborts with the caller's reason when their signal does, or with `ETIMEDOUT` at the deadline. */
  signal: AbortSignal;
};

type Entry = { held: boolean; stop: () => void; };

// By the signal the request carries, so the fetch adapter can find the deadline it was given.
const deadlines = new WeakMap<object, Entry>();

/**
 * Arms `timeout` for the whole request: middleware, schemas, every retry try, the fetch and the
 * body. The returned signal replaces `config.signal`, so every stage that watches the signal stops
 * at the deadline, and its reason is the `ETIMEDOUT` error each stage rejects with.
 */
export default function armDeadline(
  timeout: number,
  caller: AbortSignal | GenericAbortSignal | undefined,
  config: InternalFaxiosRequestConfig
): RequestDeadline {
  const controller = new AbortController();
  const message = Object.hasOwn(config, "timeoutErrorMessage") ? config.timeoutErrorMessage : undefined;
  const timer = setTimeout(() => {
    controller.abort(new FaxiosError(message || `timeout of ${timeout}ms exceeded`, FaxiosError.ETIMEDOUT, config));
  }, timeout);

  let signal = controller.signal;
  let stop = () => clearTimeout(timer);
  // any() follows the caller's signal without a listener on it, so nothing is left to unhook.
  if (caller && typeof AbortSignal.any === "function" && caller instanceof AbortSignal) {
    signal = AbortSignal.any([ caller, controller.signal ]);
  }
  // Signals from another realm or a polyfill: forward their abort until the deadline stops.
  else if (caller) {
    const forward = () => {
      caller.removeEventListener?.("abort", forward);
      controller.abort("reason" in caller ? caller.reason : undefined);
    };
    if (caller.aborted) forward();
    else caller.addEventListener?.("abort", forward);
    stop = () => {
      clearTimeout(timer);
      caller.removeEventListener?.("abort", forward);
    };
  }

  const entry: Entry = { held: false, stop };
  deadlines.set(signal, entry);
  return {
    signal,
    settle: () => {
      if (!entry.held) stop();
    },
  };
}

/**
 * Keeps the deadline of a request's signal armed after the request settles, for a
 * `responseType: "stream"` body still being read. Returns what stops it once the body ends, or
 * undefined when the signal carries no deadline.
 */
export function holdDeadline(signal: unknown): (() => void) | undefined {
  const entry = typeof signal === "object" && signal !== null ? deadlines.get(signal) : undefined;
  if (!entry) return undefined;
  entry.held = true;
  return entry.stop;
}
