"use strict";

import type { Cancel, Canceler, AxiosRequestConfig } from "../types.js";
import CanceledError from "./CanceledError.js";

type CancelListener = (cancel: Cancel) => void;

class CancelToken {
  promise: Promise<Cancel>;
  reason?: Cancel;
  _listeners: Array<CancelListener> | null = null;

  constructor(executor: (cancel: Canceler) => void) {
    if (typeof executor !== "function") {
      throw new TypeError("executor must be a function.");
    }

    let resolvePromise: ((value: Cancel) => void) | undefined;

    this.promise = new Promise<Cancel>(function promiseExecutor(resolve) {
      resolvePromise = resolve;
    });

    const token = this;

    /* eslint-disable promise/always-return */
    // eslint-disable-next-line promise/catch-or-return
    this.promise.then(cancel => {
      if (!token._listeners) return;

      let i = token._listeners.length;

      while (i-- > 0) {
        token._listeners[i]!(cancel);
      }
      token._listeners = null;
    });
    /* eslint-enable promise/always-return */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.promise as any).then = async (onfulfilled: ((value: Cancel) => unknown) | undefined) => {
      let _resolve: CancelListener | undefined;

      const promise = new Promise<Cancel>(resolve => {
        token.subscribe(resolve);
        _resolve = resolve;
      }).then(onfulfilled);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (promise as any).cancel = function reject() {
        token.unsubscribe(_resolve!);
      };

      return promise;
    };

    executor(function cancel(message?: string, config?: AxiosRequestConfig, request?: unknown) {
      if (token.reason) {
        // Cancellation has already been requested
        return;
      }

      token.reason = new CanceledError(message, config, request);
      resolvePromise!(token.reason);
    });
  }

  throwIfRequested(): void {
    if (this.reason) {
      throw this.reason;
    }
  }

  subscribe(listener: CancelListener): void {
    if (this.reason) {
      listener(this.reason);
      return;
    }

    if (this._listeners) {
      this._listeners.push(listener);
    }
    else {
      this._listeners = [ listener ];
    }
  }

  unsubscribe(listener: CancelListener): void {
    if (!this._listeners) {
      return;
    }
    const index = this._listeners.indexOf(listener);
    if (index !== -1) {
      this._listeners.splice(index, 1);
    }
  }

  toAbortSignal(): AbortSignal & { unsubscribe?: () => void; } {
    const controller = new AbortController();

    const abort = (err: Cancel) => {
      controller.abort(err);
    };

    this.subscribe(abort);

    (controller.signal as AbortSignal & { unsubscribe?: () => void; }).unsubscribe = () => this.unsubscribe(abort);

    return controller.signal;
  }

  static source(): { token: CancelToken; cancel: Canceler; } {
    let cancel: Canceler | undefined;
    const token = new CancelToken(function executor(c) {
      cancel = c;
    });
    return {
      token,
      cancel: cancel!,
    };
  }
}

export default CancelToken;
