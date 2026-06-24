"use strict";

import type { FaxiosResponse } from "../types.js";
import FaxiosError from "./FaxiosError.js";

/**
 * Resolve or reject a Promise based on response status.
 *
 * @param {Function} resolve A function that resolves the promise.
 * @param {Function} reject A function that rejects the promise.
 * @param {object} response The response.
 *
 * @returns {object} The response.
 */
export default function settle(resolve: (value: FaxiosResponse) => void, reject: (reason: unknown) => void, response: FaxiosResponse) {
  const validateStatus = response.config.validateStatus;
  if (!response.status || !validateStatus || validateStatus(response.status)) {
    resolve(response);
  }
  else {
    reject(new FaxiosError(
      "Request failed with status code " + response.status,
      response.status >= 400 && response.status < 500 ? FaxiosError.ERR_BAD_REQUEST : FaxiosError.ERR_BAD_RESPONSE,
      response.config,
      response.request,
      response
    ));
  }
}
