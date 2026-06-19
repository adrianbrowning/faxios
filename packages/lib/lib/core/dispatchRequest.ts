"use strict";

import adapters from "../adapters/adapters.js";
import CanceledError from "../cancel/CanceledError.js";
import isCancel from "../cancel/isCancel.js";
import AxiosHeaders from "../core/AxiosHeaders.js";
import defaults from "../defaults/index.js";
import type { InternalAxiosRequestConfig, AxiosResponse } from "../types.js";
import transformData from "./transformData.js";

function throwIfCancellationRequested(config: InternalAxiosRequestConfig): void {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }

  if (config.signal && config.signal.aborted) {
    throw new CanceledError(undefined, config);
  }
}

export default async function dispatchRequest(this: unknown, config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  throwIfCancellationRequested(config);

  config.headers = AxiosHeaders.from(config.headers) as unknown as typeof config.headers;

  config.data = transformData.call(config, config.transformRequest as never);

  if ([ "post", "put", "patch" ].indexOf(config.method as string) !== -1) {
    (config.headers as unknown as { setContentType: (v: string, r: boolean) => void; }).setContentType("application/x-www-form-urlencoded", false);
  }

  const adapter = adapters.getAdapter(config.adapter || defaults.adapter, config);

  /* eslint-disable promise/always-return */
  return (adapter(config)).then(
    function onAdapterResolution(response: AxiosResponse) {
      throwIfCancellationRequested(config);

      (config as unknown as Record<string, unknown>)["response"] = response;

      try {
        response.data = transformData.call(config, config.transformResponse as never, response);
        response.headers = AxiosHeaders.from(response.headers);
      }
      finally {
        delete (config as unknown as Record<string, unknown>)["response"];
      }

      return response;
    },
    async function onAdapterRejection(reason: unknown) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);

        const r = reason as { response?: { data?: unknown; headers?: unknown; status?: number; [k: string]: unknown; }; } | null;
        if (r?.response) {
          (config as unknown as Record<string, unknown>)["response"] = r.response;
          try {
            r.response.data = transformData.call(config, config.transformResponse as never, r.response);
          }
          finally {
            delete (config as unknown as Record<string, unknown>)["response"];
          }
          r.response.headers = AxiosHeaders.from(r.response.headers as Record<string, unknown>);
        }
      }

      throw reason;
    }
  );
  /* eslint-enable promise/always-return */
}
