"use strict";

import AxiosHeaders from "../core/AxiosHeaders.js";
import defaults from "../defaults/index.js";
import type { InternalAxiosRequestConfig, AxiosRequestHeaders } from "../types.js";
import utils from "../utils.js";

type TransformFn = (this: InternalAxiosRequestConfig, data: unknown, headers: AxiosRequestHeaders, status?: number) => unknown;

export default function transformData(this: unknown, fns: TransformFn | Array<TransformFn> | undefined, response?: { data?: unknown; headers?: unknown; status?: number; } | null): unknown {
  const config = (this || defaults) as InternalAxiosRequestConfig;
  const context = response || config;
  const headers = AxiosHeaders.from(context.headers as Record<string, unknown> | undefined);
  let data: unknown = (context as { data?: unknown; }).data;

  utils.forEach(fns, function transform(fn: unknown) {
    data = (fn as TransformFn).call(config, data, headers as unknown as AxiosRequestHeaders, response?.status);
  });

  headers.normalize(false);

  return data;
}
