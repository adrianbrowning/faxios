// @ts-self-types="./canceledFromSignal.d.ts" — required for Deno: index.d.ts re-exports from here

import FaxiosError from "../core/FaxiosError.js";
import type { InternalFaxiosRequestConfig } from "../types.js";
import CanceledError from "./CanceledError.js";

/**
 * The error for a request canceled through its signal, whatever stage it was in. A `FaxiosError`
 * reason is that error already (the `ETIMEDOUT` of the request's `timeout`, or a cancellation faxios
 * built), so it is returned as is. Otherwise the message comes from the reason when that is an
 * Error or a string (else "canceled"), and an Error reason is kept as `cause`.
 */
export default function canceledFromSignal(signal: { readonly aborted: boolean; reason?: unknown; }, config?: InternalFaxiosRequestConfig, request?: unknown): FaxiosError {
  const reason: unknown = signal.reason;
  if (reason instanceof FaxiosError) return reason;
  if (!(reason instanceof Error)) return new CanceledError(typeof reason === "string" ? reason : null, config, request);
  const error = new CanceledError(reason.message, config, request);
  error.cause = reason;
  return error;
}
