"use strict";

import type {
  FaxiosInterceptorHandler,
  FaxiosInterceptorFulfilled,
  FaxiosInterceptorRejected,
  FaxiosInterceptorOptions
} from "../types.js";
import utils from "../utils.js";

class InterceptorManager<T> {
  handlers: Array<FaxiosInterceptorHandler<T> | null>;

  constructor() {
    this.handlers = [];
  }

  use(
    fulfilled: FaxiosInterceptorFulfilled<T>,
    rejected?: FaxiosInterceptorRejected,
    options?: FaxiosInterceptorOptions
  ): number {
    this.handlers.push({
      fulfilled,
      rejected,
      synchronous: options ? !!options.synchronous : false,
      runWhen: options ? options.runWhen : null,
    });
    return this.handlers.length - 1;
  }

  eject(id: number): void {
    if (this.handlers[id]) {
      this.handlers[id] = null;
    }
  }

  clear(): void {
    this.handlers = [];
  }

  forEach(fn: (handler: FaxiosInterceptorHandler<T>) => void): void {
    utils.forEach(this.handlers, function forEachHandler(h: unknown) {
      if (h !== null) {
        fn(h as FaxiosInterceptorHandler<T>);
      }
    });
  }
}

export default InterceptorManager;
