"use strict";

import transitionalDefaults from "../defaults/transitional.js";
import validator from "../helpers/validator.js";
import type { ValidatorFn } from "../helpers/validator.js";
import type { FaxiosRequestConfig, InternalFaxiosRequestConfig, ParamsSerializerOptions, ResponseType, SerializerOptions } from "../types.js";
import { hasOwnProp, isFunction } from "../utils.js";
import FaxiosError from "./FaxiosError.js";

// Every request config key faxios reads. `satisfies` keeps the list in step with
// FaxiosRequestConfig: a missing key and an extra one are both type errors. Exported for the docs
// check that every key has a section on the Request config page.
export const REQUEST_CONFIG_KEYS = {
  allowAbsoluteUrls: true,
  auth: true,
  baseURL: true,
  data: true,
  env: true,
  fetchOptions: true,
  formSerializer: true,
  headers: true,
  maxBodyLength: true,
  maxContentLength: true,
  method: true,
  onDownloadProgress: true,
  onUploadProgress: true,
  params: true,
  paramsSchema: true,
  paramsSerializer: true,
  parseReviver: true,
  pathParams: true,
  pathParamsSchema: true,
  redact: true,
  requestSchema: true,
  responseSchema: true,
  responseType: true,
  signal: true,
  timeout: true,
  timeoutErrorMessage: true,
  transformRequest: true,
  transformResponse: true,
  transitional: true,
  url: true,
  validateStatus: true,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: true,
  xsrfHeaderName: true,
} satisfies Record<keyof FaxiosRequestConfig, true>;

const TRANSPORT_HINT = "faxios sends every request with fetch; configure the transport with fetchOptions (for example an undici dispatcher) or env.fetch";

// Options faxios (or axios) used to accept, with what to use instead.
const REMOVED_OPTIONS: Readonly<Record<string, string>> = {
  adapter: "faxios always sends with fetch; pass a custom fetch as env.fetch",
  allowedSocketPaths: TRANSPORT_HINT,
  beforeRedirect: "fetch follows redirects; control them with fetchOptions.redirect",
  cancelToken: "pass an AbortSignal as signal",
  decompress: "the fetch runtime decompresses responses",
  family: TRANSPORT_HINT,
  formDataHeaderPolicy: "it only applied to form-data package bodies, which aren't supported; send the global FormData",
  http2Options: TRANSPORT_HINT,
  httpAgent: TRANSPORT_HINT,
  httpsAgent: TRANSPORT_HINT,
  httpVersion: TRANSPORT_HINT,
  insecureHTTPParser: TRANSPORT_HINT,
  lookup: TRANSPORT_HINT,
  maxRate: "throttle at the application or runtime layer",
  maxRedirects: "fetch follows redirects; control them with fetchOptions.redirect",
  proxy: TRANSPORT_HINT,
  responseEncoding: "text is decoded as UTF-8; use responseType: \"arraybuffer\" and a TextDecoder for another encoding",
  sensitiveHeaders: TRANSPORT_HINT,
  socketPath: TRANSPORT_HINT,
  transport: TRANSPORT_HINT,
};

// A removed option's replacement, or the accepted option the key differs from only by case.
function hintFor(key: string, pluginOptions: ReadonlySet<string>): string {
  if (hasOwnProp(REMOVED_OPTIONS, key)) return `: it was removed; ${REMOVED_OPTIONS[key]}`;
  const lower = key.toLowerCase();
  const match = [ ...Object.keys(REQUEST_CONFIG_KEYS), ...pluginOptions ].find(known => known.toLowerCase() === lower);
  return match === undefined ? "" : `; did you mean ${match}?`;
}

// Every transitional option is a boolean flag listed in the defaults.
const TRANSITIONAL_SCHEMA = Object.fromEntries(Object.keys(transitionalDefaults).map(key => [ key, validator.validators.boolean ]));

// Every serializer option, so a typo (`indexs`, `dot`) rejects instead of changing the output.
const SERIALIZER_SCHEMA = {
  Blob: validator.validators.function,
  dots: validator.validators.boolean,
  indexes: (thing: unknown): boolean | string => thing === null || typeof thing === "boolean" || "a boolean or null",
  maxDepth: validator.validators.maxDepth,
  metaTokens: validator.validators.boolean,
  visitor: validator.validators.function,
} satisfies Record<keyof SerializerOptions, ValidatorFn>;

const PARAMS_SERIALIZER_SCHEMA = {
  ...SERIALIZER_SCHEMA,
  encode: validator.validators.function,
  serialize: validator.validators.function,
} satisfies Record<keyof ParamsSerializerOptions, ValidatorFn>;

// Each responseType, lower-cased, with the Response method the fetch adapter reads it with
// (`json` is read as text and parsed by transformResponse).
export const RESPONSE_TYPES = {
  arraybuffer: "arrayBuffer",
  blob: "blob",
  formdata: "formData",
  json: "text",
  stream: "stream",
  text: "text",
} satisfies Record<ResponseType, string>;

/**
 * Asserts that every own key of a merged request config is a faxios option or a request option an
 * installed plugin declared, then checks `transitional`, the serializer options and `responseType`.
 * An unknown key rejects with `ERR_BAD_OPTION` naming it, so a typo never silently drops a setting.
 * `config` is the internal view request() builds first, so every error here carries it.
 */
export default function assertRequestConfig(config: InternalFaxiosRequestConfig, pluginOptions: ReadonlySet<string>): void {
  for (const key of Object.keys(config)) {
    if (hasOwnProp(REQUEST_CONFIG_KEYS, key) || pluginOptions.has(key)) continue;
    throw new FaxiosError(`Unknown option ${key}${hintFor(key, pluginOptions)}`, FaxiosError.ERR_BAD_OPTION, config);
  }

  if (config.transitional !== undefined) {
    validator.assertOptions(config.transitional, TRANSITIONAL_SCHEMA, false, config);
  }

  // A function paramsSerializer is the serialize option on its own.
  const { formSerializer, paramsSerializer } = config;
  if (paramsSerializer != null && !isFunction(paramsSerializer)) {
    validator.assertOptions(paramsSerializer, PARAMS_SERIALIZER_SCHEMA, false, config);
  }
  if (formSerializer != null) {
    validator.assertOptions(formSerializer, SERIALIZER_SCHEMA, false, config);
  }

  // Matched case-insensitively, as the fetch adapter and transformResponse read it.
  const responseType: unknown = config.responseType;
  if (responseType !== undefined && (typeof responseType !== "string" || !hasOwnProp(RESPONSE_TYPES, responseType.toLowerCase()))) {
    throw new FaxiosError(
      `option responseType must be one of ${Object.keys(RESPONSE_TYPES).join(", ")}`,
      FaxiosError.ERR_BAD_OPTION_VALUE,
      config
    );
  }

  assertSizeLimit(config, "maxContentLength");
  assertSizeLimit(config, "maxBodyLength");
}

// A bad limit must not switch the size guard off: -1 is the only "unlimited" value.
function assertSizeLimit(config: InternalFaxiosRequestConfig, key: "maxBodyLength" | "maxContentLength"): void {
  const limit: unknown = hasOwnProp(config, key) ? config[key] : undefined;
  if (limit === undefined || limit === -1 || (Number.isFinite(limit) && (limit as number) >= 0)) return;
  throw new FaxiosError(
    `option ${key} must be -1 (unlimited) or a finite number of bytes from 0`,
    FaxiosError.ERR_BAD_OPTION_VALUE,
    config
  );
}
