"use strict";

import FaxiosHeaders from "../core/FaxiosHeaders.js";
import type { FaxiosRequestTransformer, FaxiosResponseTransformer, InternalFaxiosRequestConfig } from "../types.js";
import { forEach } from "../utils.js";

type TransformFn = FaxiosRequestTransformer | FaxiosResponseTransformer;

export default function transformData(this: unknown, fns: Array<TransformFn> | TransformFn | undefined, response?: null | { data?: unknown; headers?: unknown; status?: number; }): unknown {
  // Dispatch always passes the request config as `this`.
  const config = this as InternalFaxiosRequestConfig;
  const context = response || config;
  const headers = FaxiosHeaders.from(context.headers as Record<string, unknown> | undefined);
  let data: unknown = (context as { data?: unknown; }).data;

  forEach(fns, function transform(fn: unknown) {
    data = (fn as TransformFn).call(config, data, headers, response?.status);
  });

  headers.normalize(false);

  return data;
}
