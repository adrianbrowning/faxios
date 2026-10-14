"use strict";

import { getFetch } from "../adapters/fetch.js";
import canceledFromSignal from "../cancel/canceledFromSignal.js";
import isCancel from "../cancel/isCancel.js";
import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import { validateSchema } from "../core/validateSchema.js";
import raceAbort from "../helpers/raceAbort.js";
import type { FaxiosResponse, InternalFaxiosRequestConfig } from "../types.js";
import utils from "../utils.js";
import assertSignal from "./assertSignal.js";
import type { RequestBodies } from "./requestDeadline.js";
import resolveRequestURL from "./resolveRequestURL.js";
import transformData from "./transformData.js";

function throwIfCancellationRequested(config: InternalFaxiosRequestConfig): void {
  if (config.signal && config.signal.aborted) {
    throw canceledFromSignal(config.signal, config);
  }
}

// An async schema is caller code that may take any time, so the caller's abort settles the request
// right away instead of waiting for it. The final check before the adapter still runs either way.
function settleOnAbort(preFlight: () => Promise<void>, config: InternalFaxiosRequestConfig): Promise<void> {
  const signal = config.signal;
  return signal ? raceAbort(signal, preFlight, () => canceledFromSignal(signal, config)) : preFlight();
}

async function validatePathParams(config: InternalFaxiosRequestConfig, schema: NonNullable<InternalFaxiosRequestConfig["pathParamsSchema"]>): Promise<void> {
  const validated = await validateSchema(
    schema, config.pathParams,
    FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA, config
  );
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: schema can return { value: null }
  if (validated == null) {
    throw new FaxiosError(
      "pathParamsSchema returned null/undefined",
      FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA, config
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, sonarjs/different-types-comparison -- runtime guard: schema may transform to non-Record
  if (typeof validated !== "object" || validated === null || Array.isArray(validated)) {
    throw new FaxiosError(
      "pathParamsSchema must return a plain object",
      FaxiosError.ERR_BAD_PATH_PARAMS_SCHEMA, config
    );
  }
  config.pathParams = validated;
}

// Intentional mutation: config is the internal merged copy (post-mergeConfig), not the user's original.
// Validation order (pathParams → params → data) is a fail-fast guarantee — do not reorder. Path
// params are substituted afterwards, by resolveRequestURL, from the validated values.
// DO NOT make this function async. Returning undefined (not a Promise) on the fast path is a
// microtask-ordering contract: dispatchRequest must reach the adapter in the same microtask so
// that a synchronous controller.abort() after request creation is processed by the adapter's
// signal listener, not before it registers. An async function always returns a Promise, inserting
// a microtask boundary that breaks abort timing in fetch adapter tests and real-world usage.
// The schema work is returned unstarted, so its abort listener is in place before a schema runs.
function validatePreFlight(config: InternalFaxiosRequestConfig): (() => Promise<void>) | undefined {
  if (config.pathParamsSchema && config.pathParams === undefined) {
    throw new FaxiosError(
      "pathParams is required when pathParamsSchema is configured",
      FaxiosError.ERR_BAD_OPTION_VALUE, config
    );
  }

  const hasSchemas = config.pathParamsSchema || config.paramsSchema || config.requestSchema;
  if (!hasSchemas) return undefined;

  return async () => {
    if (config.pathParamsSchema) {
      await validatePathParams(config, config.pathParamsSchema);
    }

    if (config.paramsSchema) {
      throwIfCancellationRequested(config);
      const params: unknown = await validateSchema(config.paramsSchema, config.params, FaxiosError.ERR_BAD_PARAMS_SCHEMA, config);
      // The output is serialized as params, so it must be a shape buildURL reads.
      if (params != null && (typeof params !== "object" || Array.isArray(params))) {
        const error = new FaxiosError(
          "paramsSchema output must be an object, URLSearchParams, null or undefined",
          FaxiosError.ERR_BAD_PARAMS_SCHEMA, config
        );
        error.issues = [{ message: error.message }];
        throw error;
      }
      config.params = params as typeof config.params;
    }

    if (config.requestSchema) {
      throwIfCancellationRequested(config);
      config.data = await validateSchema(config.requestSchema, config.data, FaxiosError.ERR_BAD_REQUEST_SCHEMA, config);
    }
  };
}

// The default transformResponse throws a bare SyntaxError for a strict-JSON body that isn't JSON;
// dispatch owns the error, so the one the caller sees carries the response and its status.
function transformResponseData(config: InternalFaxiosRequestConfig, response: FaxiosResponse): unknown {
  try {
    return transformData(config, config.transformResponse, response);
  }
  catch (e) {
    if (e instanceof SyntaxError) throw FaxiosError.from(e, FaxiosError.ERR_BAD_RESPONSE, config, null, response);
    throw e;
  }
}

export default async function dispatchRequest(this: unknown, config: InternalFaxiosRequestConfig, bodies?: RequestBodies): Promise<FaxiosResponse> {
  // Middleware may pass on a signal of its own.
  assertSignal(config.signal, config);
  throwIfCancellationRequested(config);

  const preFlight = validatePreFlight(config);
  if (preFlight) await settleOnAbort(preFlight, config);

  // Resolved once, from the schema output, and handed to the adapter; config.url keeps the template.
  const url = resolveRequestURL(config);

  config.headers = FaxiosHeaders.from(config.headers);

  // The serialized body goes to the adapter on its own; `config.data` keeps the caller's value, so
  // the config on an error holds an object `redact` can mask instead of a JSON or form string.
  const data: unknown = transformData(config, config.transformRequest);

  // fetch can't read the npm `form-data` package (a FormData-like stream with `getHeaders()`): it
  // would send the text "[object FormData]".
  if (utils.isFormData(data) && !utils.isSpecCompliantForm(data) && utils.isFunction(utils.getSafeProp(data, "getHeaders"))) {
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
  const adapter = _adapter as (config: InternalFaxiosRequestConfig, body: unknown, url: string, bodies?: RequestBodies) => Promise<FaxiosResponse>;
   
  return (adapter(config, data, url, bodies))
    .then(

      function onAdapterResolution(response: FaxiosResponse) {
        throwIfCancellationRequested(config);

        response.data = transformResponseData(config, response);
        response.headers = FaxiosHeaders.from(response.headers);

        if (config.responseSchema) {
          return validateSchema(config.responseSchema, response.data, FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, response)
            .then(data => { response.data = data; throwIfCancellationRequested(config); return response; });
        }

        return response;
      },
      function onAdapterRejection(reason: unknown) {
        if (!isCancel(reason)) {
          throwIfCancellationRequested(config);

          const r = reason as null | { response?: { [k: string]: unknown; data?: unknown; headers?: unknown; status?: number; }; };
          if (r?.response) {
            try {
              r.response.data = transformResponseData(config, r.response as FaxiosResponse);
            }
            catch (transformErr) {
              // The status error stays the error: a body that fails to transform (an HTML page
              // for `responseType: "json"`) keeps its raw data and becomes the cause.
              if (reason instanceof FaxiosError && reason.cause === undefined) reason.cause = transformErr as Error;
            }
            r.response.headers = FaxiosHeaders.from(r.response.headers as Record<string, unknown>);
          }
        }

        throw reason;
      }
    );
   
}
