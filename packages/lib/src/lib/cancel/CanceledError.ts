// @ts-self-types="./CanceledError.d.ts" — required for Deno: index.ts re-exports CanceledError
"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type { InternalFaxiosRequestConfig } from "../types.js";

class CanceledError extends FaxiosError {
  /**
   * A `CanceledError` is an object that is thrown when an operation is canceled.
   *
   * @param {string=} message The message.
   * @param {Object=} config The config.
   * @param {Object=} request The request.
   *
   * @returns {CanceledError} The created error.
   */
  constructor(message?: null | string, config?: InternalFaxiosRequestConfig, request?: unknown) {
    super(message == null ? "canceled" : message, FaxiosError.ERR_CANCELED, config, request);
    this.name = "CanceledError";
    (this as unknown as Record<string, unknown>)["__CANCEL__"] = true;
  }
}

export default CanceledError;
