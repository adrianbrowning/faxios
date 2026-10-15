// @ts-self-types="./assertSignal.d.ts" — required for Deno: index.d.ts re-exports from here

import type { InternalFaxiosRequestConfig } from "../types.js";
import FaxiosError from "./FaxiosError.js";

/**
 * Rejects a `signal` faxios can't watch: one without an `aborted` flag and the
 * `addEventListener` / `removeEventListener` pair. A missing signal (`undefined` or `null`) passes.
 */
export default function assertSignal(signal: unknown, config: InternalFaxiosRequestConfig): void {
  if (signal == null) return;
  if (
    typeof signal !== "object" ||
    !("aborted" in signal) ||
    !("addEventListener" in signal) || typeof signal.addEventListener !== "function" ||
    !("removeEventListener" in signal) || typeof signal.removeEventListener !== "function"
  ) {
    throw new FaxiosError(
      "option signal must be an AbortSignal: an object with aborted, addEventListener and removeEventListener",
      FaxiosError.ERR_BAD_OPTION_VALUE,
      config
    );
  }
}
