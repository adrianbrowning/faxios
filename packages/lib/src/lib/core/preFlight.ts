// Pre-flight steps dispatch runs itself and the schema feature runs between its validations.

import canceledFromSignal from "../cancel/canceledFromSignal.js";
import { substitutePathParams } from "../helpers/substitutePathParams.js";
import type { InternalFaxiosRequestConfig } from "../types.js";
import FaxiosError from "./FaxiosError.js";

export function throwIfCancellationRequested(config: InternalFaxiosRequestConfig): void {
  if (config.signal && config.signal.aborted) {
    throw canceledFromSignal(config.signal, config);
  }
}

/** Fills the `{key}` placeholders in `config.url` from `config.pathParams`. */
export function fillPathParams(config: InternalFaxiosRequestConfig): void {
  try {
    config.url = substitutePathParams(config.url ?? "", config.pathParams ?? {});
  }
  catch (err) {
    throw FaxiosError.from(err instanceof Error ? err : new Error(String(err)), FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
}
