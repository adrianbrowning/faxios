"use strict";

import type { FaxiosResponse } from "../types.js";
import FaxiosError from "./FaxiosError.js";

// The error `validateStatus` turns the response into, or `undefined` when it accepts the status.
// A throwing validateStatus throws here.
export function statusError(response: FaxiosResponse): FaxiosError | undefined {
  const validateStatus = response.config.validateStatus;
  if (!response.status || !validateStatus || validateStatus(response.status)) return undefined;
  return new FaxiosError(
    "Request failed with status code " + response.status,
    response.status >= 400 && response.status < 500 ? FaxiosError.ERR_BAD_REQUEST : FaxiosError.ERR_BAD_RESPONSE,
    response.config,
    response.request,
    response
  );
}
