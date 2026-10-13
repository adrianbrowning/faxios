"use strict";

import transitionalDefaults from "../defaults/transitional.js";
import validator from "../helpers/validator.js";
import type { FaxiosRequestConfig, InternalFaxiosRequestConfig, ResponseType } from "../types.js";
import utils from "../utils.js";
import FaxiosError from "./FaxiosError.js";

// Every request config key faxios reads. `satisfies` keeps the list in step with
// FaxiosRequestConfig: a missing key and an extra one are both type errors.
const REQUEST_CONFIG_KEYS = {
  allowAbsoluteUrls: true,
  auth: true,
  baseURL: true,
  data: true,
  env: true,
  fetchOptions: true,
  formDataHeaderPolicy: true,
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
  if (utils.hasOwnProp(REMOVED_OPTIONS, key)) return `: it was removed; ${REMOVED_OPTIONS[key]}`;
  const lower = key.toLowerCase();
  const match = [ ...Object.keys(REQUEST_CONFIG_KEYS), ...pluginOptions ].find(known => known.toLowerCase() === lower);
  return match === undefined ? "" : `; did you mean ${match}?`;
}

// Every transitional option is a boolean flag listed in the defaults.
const TRANSITIONAL_SCHEMA = Object.fromEntries(Object.keys(transitionalDefaults).map(key => [ key, validator.validators.boolean ]));

const RESPONSE_TYPES = {
  arraybuffer: true,
  blob: true,
  formdata: true,
  json: true,
  stream: true,
  text: true,
} satisfies Record<ResponseType, true>;

/**
 * Asserts that every own key of a merged request config is a faxios option or a request option an
 * installed plugin declared, then checks `transitional` and `responseType`. An unknown key rejects
 * with `ERR_BAD_OPTION` naming it, so a typo never silently drops a setting.
 */
export default function assertRequestConfig(config: FaxiosRequestConfig, pluginOptions: ReadonlySet<string>): void {
  for (const key of Object.keys(config)) {
    if (utils.hasOwnProp(REQUEST_CONFIG_KEYS, key) || pluginOptions.has(key)) continue;
    throw new FaxiosError(`Unknown option ${key}${hintFor(key, pluginOptions)}`, FaxiosError.ERR_BAD_OPTION, config as InternalFaxiosRequestConfig);
  }

  if (config.transitional !== undefined) {
    validator.assertOptions(config.transitional, TRANSITIONAL_SCHEMA, false);
  }

  // Matched case-insensitively, as the fetch adapter reads it.
  const responseType: unknown = config.responseType;
  if (responseType !== undefined && (typeof responseType !== "string" || !utils.hasOwnProp(RESPONSE_TYPES, responseType.toLowerCase()))) {
    throw new FaxiosError(
      `option responseType must be one of ${Object.keys(RESPONSE_TYPES).join(", ")}`,
      FaxiosError.ERR_BAD_OPTION_VALUE,
      config as InternalFaxiosRequestConfig
    );
  }
}
