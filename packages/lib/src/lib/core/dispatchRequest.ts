"use strict";

import { getFetch } from "../adapters/fetch.js";
import canceledFromSignal from "../cancel/canceledFromSignal.js";
import isCancel from "../cancel/isCancel.js";
import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import { assertNoSchemaOptions, bindFeatures } from "../core/features.js";
import type { Features } from "../core/features.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "../types.js";
import { getSafeProp, isFormData, isFunction, isSpecCompliantForm } from "../utils.js";
import { fillPathParams, throwIfCancellationRequested } from "./preFlight.js";
import transformData from "./transformData.js";

// An async schema is caller code that may take any time, so the caller's abort settles the request
// right away instead of waiting for it. The final check before the adapter still runs either way.
function settleOnAbort(preFlight: Promise<void>, config: InternalFaxiosRequestConfig): Promise<void> {
  const signal = config.signal;
  if (!signal || typeof signal.addEventListener !== "function") return preFlight;
  // The executor form: the library's TypeScript lib target has no Promise.withResolvers.
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener?.("abort", onAbort);
      reject(canceledFromSignal(signal, config));
    };
    signal.addEventListener?.("abort", onAbort);
    // Once the abort has settled the request, the schema's result has nowhere to go; this still
    // consumes it, so it never becomes an unhandled rejection.
    preFlight.finally(() => signal.removeEventListener?.("abort", onAbort)).then(resolve, reject);
    // A schema may abort before its first await, which fires no event once we listen.
    if (signal.aborted) onAbort();
  });
}

// Without the schema feature, a schema option can only arrive here through middleware; it rejects
// rather than go unchecked.
function preFlight(config: InternalFaxiosRequestConfig, features: Features): Promise<void> | undefined {
  if (features.schema) return features.schema.preFlight(config);
  assertNoSchemaOptions(config);
  if (config.pathParams !== undefined) fillPathParams(config);
  return undefined;
}

/**
 * Sends one request: pre-flight (the schema feature's validations, path params), transformRequest,
 * the fetch adapter, transformResponse and the schema feature's response check. `features` are the
 * ones installed on the request's instance.
 */
export default async function dispatchRequest(this: unknown, config: InternalFaxiosRequestConfig, features: Features): Promise<FaxiosResponse> {
  bindFeatures(config, features);
  throwIfCancellationRequested(config);

  const pending = preFlight(config, features);
  if (pending) await settleOnAbort(pending, config);

  config.headers = FaxiosHeaders.from(config.headers);

  config.data = transformData.call(config, config.transformRequest);

  // fetch can't read the npm `form-data` package (a FormData-like stream with `getHeaders()`): it
  // would send the text "[object FormData]".
  const data: unknown = config.data;
  if (isFormData(data) && !isSpecCompliantForm(data) && isFunction(getSafeProp(data, "getHeaders"))) {
    throw new FaxiosError(
      "The form-data package is not supported as a request body; use the global FormData",
      FaxiosError.ERR_NOT_SUPPORT,
      config
    );
  }

  // Last cancellation check: nothing between here and the adapter call may await. An abort that
  // lands during pre-flight validation must not reach the adapter, which only listens for future
  // abort events.
  throwIfCancellationRequested(config);

  const _adapter = getFetch(config);
  if (!_adapter) {
    throw new FaxiosError(
      "Fetch API is not supported in this environment",
      FaxiosError.ERR_NOT_SUPPORT,
      config
    );
  }
  const adapter = _adapter as (config: InternalFaxiosRequestConfig) => Promise<FaxiosResponse>;

  /* eslint-disable promise/always-return */
  return (adapter(config))
    .then(

      function onAdapterResolution(response: FaxiosResponse) {
        throwIfCancellationRequested(config);

        (config as unknown as Record<string, unknown>)["response"] = response;

        try {
          response.data = transformData.call(config, config.transformResponse, response);
          response.headers = FaxiosHeaders.from(response.headers);
        }
        finally {
          delete (config as unknown as Record<string, unknown>)["response"];
        }

        if (features.schema && config.responseSchema) {
          return features.schema.checkResponse(config, response);
        }

        return response;
      },
      function onAdapterRejection(reason: unknown) {
        if (!isCancel(reason)) {
          throwIfCancellationRequested(config);

          const r = reason as null | { response?: { [k: string]: unknown; data?: unknown; headers?: unknown; status?: number; }; };
          if (r?.response) {
            (config as unknown as Record<string, unknown>)["response"] = r.response;
            try {
              r.response.data = transformData.call(config, config.transformResponse, r.response);
            }
            finally {
              delete (config as unknown as Record<string, unknown>)["response"];
            }
            r.response.headers = FaxiosHeaders.from(r.response.headers as Record<string, unknown>);
          }
        }

        throw reason;
      }
    );
  /* eslint-enable promise/always-return */
}
