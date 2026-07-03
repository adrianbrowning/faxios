"use strict";

import type {
  FaxiosInterceptorHandler,
  FaxiosInterceptorFulfilled,
  FaxiosInterceptorRejected,
  FaxiosInterceptorOptions
} from "../types.js";

class InterceptorManager<T> {
  #handlers: Map<number, FaxiosInterceptorHandler<T>> = new Map();
  #idCounter = 0;

  use(
    fulfilled: FaxiosInterceptorFulfilled<T>,
    rejected?: FaxiosInterceptorRejected,
    options?: FaxiosInterceptorOptions
  ): number {
    const id = this.#idCounter++;
    this.#handlers.set(id, {
      fulfilled,
      rejected,
      synchronous: options ? !!options.synchronous : false,
      runWhen: options ? options.runWhen : null,
    });
    return id;
  }

  eject(id: number): void {
    this.#handlers.delete(id);
  }

  clear(): void {
    this.#handlers.clear();
  }

  forEach(fn: (handler: FaxiosInterceptorHandler<T>) => void): void {
    for (const handler of this.#handlers.values()) {
      fn(handler);
    }
  }
}

export default InterceptorManager;
