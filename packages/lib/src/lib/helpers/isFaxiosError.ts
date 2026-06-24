"use strict";

import utils from "../utils.js";

/**
 * Determines whether the payload is an error thrown by Faxios
 *
 * @param {*} payload The value to test
 *
 * @returns {boolean} True if the payload is an error thrown by Faxios, otherwise false
 */
export default function isFaxiosError(payload: unknown) {
  return utils.isObject(payload) && (payload as Record<string, unknown>).isFaxiosError === true;
}
