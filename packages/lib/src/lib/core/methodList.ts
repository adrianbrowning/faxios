"use strict";

import type { RawFaxiosRequestHeaders } from "../types.js";

/**
 * HTTP methods faxios exposes as request shorthands. Single source of truth:
 * `defaults` seeds a per-method header bucket for each one, and
 * `Faxios#request` strips those buckets from the merged config headers. A
 * method missing here leaks its bucket into the request as a literal header.
 */
export const HTTP_METHODS = Object.freeze([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "query",
] as const);

export type HttpMethod = typeof HTTP_METHODS[number];

/**
 * Every bucket key `defaults.headers` may carry — the methods plus `common`.
 * Frozen at module scope so header flattening allocates nothing per request.
 */
export const HEADER_BUCKET_KEYS: ReadonlyArray<HttpMethod | "common"> =
  Object.freeze([ ...HTTP_METHODS, "common" ]);

/** Fresh, empty per-method header buckets for `defaults.headers`. */
export const emptyMethodHeaderBuckets = (): Record<
  HttpMethod,
  RawFaxiosRequestHeaders
> =>
  Object.fromEntries(HTTP_METHODS.map(method => [ method, {} ])) as Record<
    HttpMethod,
    RawFaxiosRequestHeaders
  >;
