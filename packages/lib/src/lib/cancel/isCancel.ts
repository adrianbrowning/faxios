"use strict";

import type CanceledError from "./CanceledError.js";

// Checks the `__CANCEL__` flag CanceledError sets, not `instanceof`, so
// cancellations from another copy of faxios still match. The flag is a plain
// writable property, so any object carrying it is narrowed.
export default function isCancel(value: unknown): value is CanceledError {
  return !!(value && (value as Record<string, unknown>).__CANCEL__);
}
