"use strict";

import type CanceledError from "./CanceledError.js";

// Checks the `__CANCEL__` brand that only CanceledError sets, not `instanceof`,
// so cancellations from another copy of faxios still match.
export default function isCancel(value: unknown): value is CanceledError {
  return !!(value && (value as Record<string, unknown>).__CANCEL__);
}
