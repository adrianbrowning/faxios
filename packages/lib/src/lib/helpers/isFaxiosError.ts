// @ts-self-types="./isFaxiosError.d.ts" — required for Deno: index.ts re-exports isFaxiosError
"use strict";

import type FaxiosError from "../core/FaxiosError.js";
import { isObject } from "../utils.js";

/**
 * Determines whether the payload is an error thrown by Faxios.
 *
 * Checks the `isFaxiosError` brand, not `instanceof`, so errors from another
 * copy of faxios still match. `T` and `D` type `response.data` and
 * `config.data`; they are not checked at runtime.
 *
 * @param {*} payload The value to test
 *
 * @returns {boolean} True if the payload is an error thrown by Faxios, otherwise false
 */
export default function isFaxiosError<T = unknown, D = unknown>(payload: unknown): payload is FaxiosError<T, D> {
  return isObject(payload) && (payload as Record<string, unknown>).isFaxiosError === true;
}
