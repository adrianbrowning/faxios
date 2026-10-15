import canceledFromSignal from "../cancel/canceledFromSignal.js";
import { onAbort } from "../helpers/raceAbort.js";
import type { GenericAbortSignal, InternalFaxiosRequestConfig } from "../types.js";
import type { WebAbortSignal } from "../types/web.js";
import FaxiosError from "./FaxiosError.js";

export type RequestDeadline = {
  /** Stops the timer and unhooks the caller's signal. */
  settle: () => void;
  /** Aborts with the caller's reason when their signal does, or with `ETIMEDOUT` at the deadline. */
  signal: WebAbortSignal;
};

/**
 * Arms `timeout` for the whole request: middleware, schemas, every retry try, the fetch and the
 * body. The returned signal replaces `config.signal`, so every stage that watches the signal stops
 * at the deadline, and its reason is the `ETIMEDOUT` error each stage rejects with.
 */
export default function armDeadline(
  timeout: number,
  caller: GenericAbortSignal | undefined | WebAbortSignal,
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

type AbortBody = (reason: FaxiosError) => void;

/**
 * The `responseType: "stream"` bodies one request opened, which the request's signal (the
 * caller's, or the deadline's) must still govern after the request settles: even when middleware
 * gave the fetch a signal of its own, such as a retry try's, that stopped following the request's
 * when the try ended, and whatever response object middleware hands back.
 */
export class RequestBodies {
  readonly #config: InternalFaxiosRequestConfig;
  #done = false;
  readonly #open = new Set<AbortBody>();
  #released = false;
  readonly #settle: () => void;
  readonly #signal: GenericAbortSignal | WebAbortSignal;
  #unwatch: (() => void) | undefined;

  constructor(signal: GenericAbortSignal | WebAbortSignal, config: InternalFaxiosRequestConfig, settle: () => void) {
    this.#signal = signal;
    this.#config = config;
    this.#settle = settle;
  }

  /**
   * The adapter opened a stream body; `abort` aborts the fetch it comes from. Returns what to call
   * once the body ends, errors or is cancelled.
   */
  open(abort: AbortBody): () => void {
    if (this.#done) {
      // Opened after the request let go of its signal: only an abort already seen applies.
      if (this.#signal.aborted) abort(canceledFromSignal(this.#signal, this.#config));
      return () => {};
    }
    this.#open.add(abort);
    if (this.#released) this.#watch();
    return () => {
      if (this.#open.delete(abort) && this.#released && this.#open.size === 0) this.#finish();
    };
  }

  /** The request settled, either way: `settle` runs now, or once every open body has ended. */
  release(): void {
    this.#released = true;
    if (this.#open.size === 0) this.#finish();
    else this.#watch();
  }

  // An abort ends every open body at once, and with it the request's hold on its signal.
  #watch(): void {
    this.#unwatch ??= onAbort(this.#signal, () => {
      const reason = canceledFromSignal(this.#signal, this.#config);
      for (const abort of this.#open) abort(reason);
      this.#open.clear();
      this.#finish();
    });
  }

  #finish(): void {
    if (this.#done) return;
    this.#done = true;
    this.#unwatch?.();
    this.#settle();
  }
}
