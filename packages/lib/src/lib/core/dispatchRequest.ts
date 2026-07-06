"use strict";

import { getFetch } from "../adapters/fetch.js";
import CanceledError from "../cancel/CanceledError.js";
import isCancel from "../cancel/isCancel.js";
import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import { validateSchema } from "../core/validateSchema.js";
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

  if (config.paramsSchema) {
    config.params = await validateSchema(config.paramsSchema, config.params, FaxiosError.ERR_BAD_PARAMS_SCHEMA, config) as typeof config.params;
  }

  if (config.requestSchema) {
    config.data = await validateSchema(config.requestSchema, config.data, FaxiosError.ERR_BAD_REQUEST_SCHEMA, config) as typeof config.data;
  }

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
  response.data = await validateSchema(config.responseSchema, response.data, FaxiosError.ERR_BAD_RESPONSE_SCHEMA, config, response);
  throwIfCancellationRequested(config);
  return response;
}
