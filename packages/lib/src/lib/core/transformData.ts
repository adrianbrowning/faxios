"use strict";

import FaxiosHeaders from "../core/FaxiosHeaders.js";
import defaults from "../defaults/index.js";
import type { InternalFaxiosRequestConfig, FaxiosRequestHeaders, FaxiosRequestTransformer, FaxiosResponseTransformer } from "../types.js";
import utils from "../utils.js";

type TransformFn = FaxiosRequestTransformer | FaxiosResponseTransformer;

export default function transformData(this: unknown, fns: TransformFn | Array<TransformFn> | undefined, response?: { data?: unknown; headers?: unknown; status?: number; } | null): unknown {
  const config = (this || defaults) as InternalFaxiosRequestConfig;
  const context = response || config;
  const headers = FaxiosHeaders.from(context.headers as Record<string, unknown> | undefined);
  let data: unknown = (context as { data?: unknown; }).data;

  utils.forEach(fns, function transform(fn: unknown) {
    data = (fn as TransformFn).call(config, data, headers as unknown as FaxiosRequestHeaders, response?.status);
  });

  headers.normalize(false);

  return data;
}
