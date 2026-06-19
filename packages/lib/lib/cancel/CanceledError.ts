"use strict";

import AxiosError from "../core/AxiosError.js";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "../types.js";

class CanceledError extends AxiosError {
  /**
   * A `CanceledError` is an object that is thrown when an operation is canceled.
   *
   * @param {string=} message The message.
   * @param {Object=} config The config.
   * @param {Object=} request The request.
   *
   * @returns {CanceledError} The created error.
   */
  constructor(message?: string | null, config?: AxiosRequestConfig, request?: unknown) {
    super(message == null ? "canceled" : message, AxiosError.ERR_CANCELED, config as InternalAxiosRequestConfig, request);
    this.name = "CanceledError";
    (this as unknown as Record<string, unknown>)["__CANCEL__"] = true;
  }
}

export default CanceledError;
