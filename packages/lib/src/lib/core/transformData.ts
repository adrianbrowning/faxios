"use strict";

import FaxiosHeaders from "../core/FaxiosHeaders.js";
import type { HeaderInput } from "../core/FaxiosHeaders.js";
import type { FaxiosRequestTransformer, FaxiosResponseTransformer, InternalFaxiosRequestConfig } from "../types.js";
import { forEach } from "../utils.js";

type TransformFn = FaxiosRequestTransformer | FaxiosResponseTransformer;

/** Runs `fns` over the response (when given) or the request config, with `config` as `this`. */
export default function transformData(config: InternalFaxiosRequestConfig, fns: Array<TransformFn> | TransformFn | undefined, response?: { data?: unknown; headers?: unknown; status?: number; }): unknown {
  const headers = FaxiosHeaders.from((response ? response.headers : config.headers) as HeaderInput);
  let data: unknown = response ? response.data : config.data;

  forEach(fns, function transform(fn: unknown) {
    data = (fn as TransformFn).call(config, data, headers, response?.status);
  });

  return data;
}
