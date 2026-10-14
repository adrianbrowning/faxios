// The part of an AbortSignal these helpers use, so a polyfilled signal or one from another realm works too.
export type AbortableSignal = {
  readonly aborted: boolean;
  addEventListener: (type: "abort", listener: () => void) => unknown;
  removeEventListener: (type: "abort", listener: () => void) => unknown;
};

/**
 * Calls `listener` once when `signal` aborts, or right away when it already has. Returns what
 * removes the listener; call it on every path that ends the work the listener guards.
 */
export function onAbort(signal: AbortableSignal, listener: () => void): () => void {
  if (signal.aborted) {
    listener();
    return () => {};
  }
  const handler = () => {
    signal.removeEventListener("abort", handler);
    listener();
  };
  signal.addEventListener("abort", handler);
  return () => signal.removeEventListener("abort", handler);
}

/**
 * Settles with what `run` gives, or rejects with `abortError()` as soon as `signal` aborts,
 * whichever comes first. An already-aborted signal rejects without calling `run`. The listener is
 * added before `run` starts, so an abort during its synchronous part is seen; a synchronous throw
 * becomes a rejection; the listener is removed on every path; and a result that loses the race is
 * still consumed, so it never becomes an unhandled rejection.
 */
export default function raceAbort<T>(signal: AbortableSignal, run: () => PromiseLike<T> | T, abortError: () => unknown): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  // The executor form: the library's TypeScript lib target has no Promise.withResolvers.
  return new Promise((resolve, reject) => {
    const stop = onAbort(signal, () => reject(abortError()));
    // The executor calls run() right away and turns a synchronous throw into a rejection, which
    // Promise.resolve(run()) wouldn't, and .then(run) would delay run by a tick.
    // eslint-disable-next-line sonarjs/prefer-promise-shorthand -- see above
    const pending = new Promise<T>(_resolve => {
      _resolve(run());
    });
    pending.finally(stop).then(resolve, reject);
  });
}
