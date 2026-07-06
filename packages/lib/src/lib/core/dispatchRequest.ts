"use strict";

import { getFetch } from "../adapters/fetch.js";
import CanceledError from "../cancel/CanceledError.js";
import isCancel from "../cancel/isCancel.js";
import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type { InternalFaxiosRequestConfig, FaxiosResponse } from "../types.js";
import utils from "../utils.js";
import transformData from "./transformData.js";

function throwIfCancellationRequested(config: InternalFaxiosRequestConfig): void {
  if (config.signal && config.signal.aborted) {
    throw new CanceledError(undefined, config);
  }
}

export default async function dispatchRequest(this: unknown, config: InternalFaxiosRequestConfig): Promise<FaxiosResponse> {
  throwIfCancellationRequested(config);

  config.headers = FaxiosHeaders.from(config.headers) as unknown as typeof config.headers;

  config.data = transformData.call(config, config.transformRequest);

  if (config.data != null && !utils.isFormData(config.data) && [ "post", "put", "patch" ].indexOf(config.method as string) !== -1) {
    (config.headers as unknown as { setContentType: (v: string, r: boolean) => void; }).setContentType("application/x-www-form-urlencoded", false);
  }

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
  return (adapter(config)).then(

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

      if (config.responseSchema) {
        return validateResponseSchema(config as typeof config & { responseSchema: StandardSchemaV1; }, response);
      }

      return response;
    },
    function onAdapterRejection(reason: unknown) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);

        const r = reason as { response?: { data?: unknown; headers?: unknown; status?: number; [k: string]: unknown; }; } | null;
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

async function validateResponseSchema(
  config: InternalFaxiosRequestConfig & { responseSchema: StandardSchemaV1; },
  response: FaxiosResponse
): Promise<FaxiosResponse> {
  let result: StandardSchemaV1.Result<unknown> | undefined = undefined;
  try {
    const raw = config.responseSchema["~standard"].validate(response.data);
    result = raw instanceof Promise ? await raw : raw;
  }
  catch (err) {
    throw FaxiosError.from(
      err instanceof Error ? err : new Error(String(err)),
      FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, undefined, response
    );
  }
  throwIfCancellationRequested(config);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!result) {
    throw new FaxiosError(
      "responseSchema['~standard'].validate() returned a non-Result value",
      FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, undefined, response
    );
  }
  if (result.issues !== undefined) {
    const error = new FaxiosError(
      "Response validation failed",
      FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, undefined, response
    );
    // ponytail: strip to spec-only fields — runtime libs may attach sensitive data
    error.issues = result.issues.map(({ message, path }) => path ? { message, path } : { message });
    throw error;
  }
  response.data = result.value;
  return response;
}
