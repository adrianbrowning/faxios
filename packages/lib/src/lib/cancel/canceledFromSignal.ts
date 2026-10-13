import type { FaxiosRequestConfig } from "../types.js";
import CanceledError from "./CanceledError.js";

/**
 * The error for a request canceled through its signal, whatever stage it was in. It takes the
 * message from the abort reason when that is an Error or a string (else "canceled"), and keeps an
 * Error reason as `cause`.
 */
export default function canceledFromSignal(signal: { readonly aborted: boolean; reason?: unknown; }, config?: FaxiosRequestConfig, request?: unknown): CanceledError {
  const reason: unknown = signal.reason;
  if (!(reason instanceof Error)) return new CanceledError(typeof reason === "string" ? reason : null, config, request);
  const error = new CanceledError(reason.message, config, request);
  error.cause = reason;
  return error;
}
