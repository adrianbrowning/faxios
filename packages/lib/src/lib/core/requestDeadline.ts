import canceledFromSignal from "../cancel/canceledFromSignal.js";
import { onAbort } from "../helpers/raceAbort.js";
import type { GenericAbortSignal, InternalFaxiosRequestConfig } from "../types.js";
import FaxiosError from "./FaxiosError.js";

export type RequestDeadline = {
  /** Stops the timer and unhooks the caller's signal. */
  settle: () => void;
  /** Aborts with the caller's reason when their signal does, or with `ETIMEDOUT` at the deadline. */
  signal: AbortSignal;
};

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

  // A listener for every caller signal, never AbortSignal.any(): an any() signal stays linked to
  // the caller's for as long as that lives, so a long-lived signal would keep every request's alive.
  const unforward = caller ? onAbort(caller, () => controller.abort("reason" in caller ? caller.reason : undefined)) : undefined;
  return {
    signal: controller.signal,
    settle: () => {
      clearTimeout(timer);
      unforward?.();
    },
  };
}

type OpenBody = {
  abort: (reason: FaxiosError) => void;
  ended: boolean;
  onEnd: (() => void) | undefined;
};

// By the response the adapter resolves with, which middleware such as retry passes on as is.
const openBodies = new WeakMap<object, OpenBody>();

export type StreamBody = {
  /** Marks `response` as the one carrying this body, until the body ends. */
  attach: (response: object) => void;
  /** The body ended, errored or was cancelled. */
  end: () => void;
};

/**
 * A `responseType: "stream"` body the request's signal must still govern after the request
 * settles. `abort` aborts the fetch the body comes from.
 */
export function openStreamBody(abort: (reason: FaxiosError) => void): StreamBody {
  const body: OpenBody = { abort, ended: false, onEnd: undefined };
  return {
    attach: response => {
      if (!body.ended) openBodies.set(response, body);
    },
    end: () => {
      if (body.ended) return;
      body.ended = true;
      body.onEnd?.();
    },
  };
}

/**
 * Runs `settle` once the request is done with `signal`: at once, or, for a response whose stream
 * body is still open, once that body ends. Until then an abort of `signal` (the caller's, or the
 * deadline's) aborts the body, even when middleware gave the fetch a signal of its own, such as a
 * retry try's, that stopped following the request's when the try ended.
 */
export function settleAfterBody(
  response: unknown,
  signal: AbortSignal | GenericAbortSignal,
  config: InternalFaxiosRequestConfig,
  settle: () => void
): void {
  const body = typeof response === "object" && response !== null ? openBodies.get(response) : undefined;
  if (!body || body.ended) {
    settle();
    return;
  }
  const stop = onAbort(signal, () => body.abort(canceledFromSignal(signal, config)));
  body.onEnd = () => {
    stop();
    settle();
  };
}
