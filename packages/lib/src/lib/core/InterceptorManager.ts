"use strict";

import type {
  AxiosInterceptorHandler,
  AxiosInterceptorFulfilled,
  AxiosInterceptorRejected,
  AxiosInterceptorOptions
} from "../types.js";
import utils from "../utils.js";

class InterceptorManager<T> {
  handlers: Array<AxiosInterceptorHandler<T> | null>;

  constructor() {
    this.handlers = [];
  }

  use(
    fulfilled: AxiosInterceptorFulfilled<T>,
    rejected?: AxiosInterceptorRejected,
    options?: AxiosInterceptorOptions
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

  forEach(fn: (handler: AxiosInterceptorHandler<T>) => void): void {
    utils.forEach(this.handlers, function forEachHandler(h: unknown) {
      if (h !== null) {
        fn(h as AxiosInterceptorHandler<T>);
      }
    });
  }
}

export default InterceptorManager;
