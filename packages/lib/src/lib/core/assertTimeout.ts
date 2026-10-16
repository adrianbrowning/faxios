import type { InternalFaxiosRequestConfig } from "../types.js";
import FaxiosError from "./FaxiosError.js";

// setTimeout fires at once for anything longer: it keeps the delay as a signed 32-bit integer.
export const MAX_TIMER_MS = 2_147_483_647;

/** Rejects a `timeout` that isn't a number of milliseconds from 0 to the setTimeout limit. */
export default function assertTimeout(timeout: unknown, config: InternalFaxiosRequestConfig): void {
  if (timeout == null) return;
  // A number only: Number() turns `true` into 1 and `" "` or `[]` into 0, which would pass.
  if (typeof timeout !== "number" || !Number.isFinite(timeout)) {
    throw new FaxiosError("`config.timeout` must be a finite number of milliseconds", FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
  const ms = timeout;
  if (ms < 0 || ms > MAX_TIMER_MS) {
    throw new FaxiosError(`\`config.timeout\` must be from 0 to ${MAX_TIMER_MS} milliseconds, got ${ms}`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
}
