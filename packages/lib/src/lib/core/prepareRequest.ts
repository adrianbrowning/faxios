import FaxiosHeaders from "../core/FaxiosHeaders.js";
import type { HeaderInput } from "../core/FaxiosHeaders.js";
import cookies from "../helpers/cookies.js";
import isURLSameOrigin from "../helpers/isURLSameOrigin.js";
import platform from "../platform.js";
import type { FaxiosRequestConfig } from "../types.js";
import { hasOwnProp, isFunction, isObject } from "../utils.js";
import cloneConfig from "./cloneConfig.js";

function applyXSRFToken(
  headers: FaxiosHeaders,
  withXSRFToken: ((cfg: unknown) => unknown) | boolean | null | undefined,
  xsrf: { cookieName: string | undefined; headerName: string | undefined; url: string; },
  config: FaxiosRequestConfig
): boolean {
  if (isFunction(withXSRFToken)) {
    withXSRFToken = (withXSRFToken as (cfg: unknown) => unknown)(
      config
    ) as boolean | null | undefined;
  }

  // Strict boolean check — prevents proto-pollution gadgets (e.g. Object.prototype.withXSRFToken = 1)
  // and misconfigurations (e.g. "false") from short-circuiting the same-origin check and leaking
  // the XSRF token cross-origin.
  const shouldSendXSRF =
    withXSRFToken === true ||
    (withXSRFToken == null && isURLSameOrigin(xsrf.url));

  if (!shouldSendXSRF) return false;

  const { cookieName: xsrfCookieName, headerName: xsrfHeaderName } = xsrf;
  const xsrfValue =
    xsrfHeaderName && xsrfCookieName && cookies.read(xsrfCookieName);

  if (!xsrfValue) return false;

  headers.set(xsrfHeaderName, xsrfValue);
  return true;
}

// `url` is the URL dispatch resolved with resolveRequestURL; it is not resolved again here.
function prepareRequest(config: FaxiosRequestConfig, url: string): FaxiosRequestConfig {
  const newConfig = cloneConfig(config);

  // Read only own properties to prevent prototype pollution gadgets
  // (e.g. Object.prototype.baseURL = 'https://evil.com').
  const own = (key: string) =>
    hasOwnProp(newConfig, key)
      ? (newConfig as Record<string, unknown>)[key]
      : undefined;

  let withXSRFToken = own("withXSRFToken") as
    | ((cfg: unknown) => unknown)
    | boolean
    | null
    | undefined;
  const xsrfHeaderName = own("xsrfHeaderName") as string | undefined;
  const xsrfCookieName = own("xsrfCookieName") as string | undefined;

  // A copy, never the caller's instance: config.headers reaches error.config and toJSON(), and
  // the XSRF token set below must not.
  const headers = new FaxiosHeaders(own("headers") as HeaderInput);
  newConfig.headers = headers;

  newConfig.url = url;

  // Add xsrf header
  // This is only done if running in a standard browser environment.
  // Specifically not if we're in a web worker.
  if (
    platform.hasStandardBrowserEnv &&
    applyXSRFToken(headers, withXSRFToken, { cookieName: xsrfCookieName, headerName: xsrfHeaderName, url }, newConfig)
  ) {
    // Fetch strips only Authorization when a redirect leaves the origin, so following one would
    // send the XSRF token to whatever host it points at. Refuse redirects unless the caller chose;
    // an own `undefined` is unset, as fetch reads it.
    const fetchOptions = own("fetchOptions") as Record<string, unknown> | undefined;
    if (!isObject(fetchOptions) || !hasOwnProp(fetchOptions, "redirect") || fetchOptions["redirect"] === undefined) {
      newConfig.fetchOptions = { ...fetchOptions, redirect: "error" };
    }
  }

  return newConfig;
}

export default prepareRequest;
