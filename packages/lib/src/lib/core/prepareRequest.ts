import FaxiosHeaders from "../core/FaxiosHeaders.js";
import cloneConfig from "../helpers/cloneConfig.js";
import cookies from "../helpers/cookies.js";
import isURLSameOrigin from "../helpers/isURLSameOrigin.js";
import platform from "../platform.js";
import type { FaxiosRequestConfig } from "../types.js";
import utils from "../utils.js";

function applyXSRFToken(
  headers: FaxiosHeaders,
  withXSRFToken: ((cfg: unknown) => unknown) | boolean | null | undefined,
  xsrfHeaderName: string | undefined,
  xsrfCookieName: string | undefined,
  config: FaxiosRequestConfig
): boolean {
  if (utils.isFunction(withXSRFToken)) {
    withXSRFToken = (withXSRFToken as (cfg: unknown) => unknown)(
      config
    ) as boolean | null | undefined;
  }

  // Strict boolean check — prevents proto-pollution gadgets (e.g. Object.prototype.withXSRFToken = 1)
  // and misconfigurations (e.g. "false") from short-circuiting the same-origin check and leaking
  // the XSRF token cross-origin.
  const shouldSendXSRF =
    withXSRFToken === true ||
    (withXSRFToken == null && isURLSameOrigin(config.url ?? ""));

  if (!shouldSendXSRF) return false;

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
    utils.hasOwnProp(newConfig, key)
      ? (newConfig as Record<string, unknown>)[key]
      : undefined;

  let withXSRFToken = own("withXSRFToken") as
    | ((cfg: unknown) => unknown)
    | boolean
    | null
    | undefined;
  const xsrfHeaderName = own("xsrfHeaderName") as string | undefined;
  const xsrfCookieName = own("xsrfCookieName") as string | undefined;

  const headers: FaxiosHeaders = FaxiosHeaders.from(
    own("headers") as null | Record<string, unknown> | undefined
  );
  newConfig.headers = headers;

  newConfig.url = url;

  // Add xsrf header
  // This is only done if running in a standard browser environment.
  // Specifically not if we're in a web worker.
  if (
    platform.hasStandardBrowserEnv &&
    applyXSRFToken(headers, withXSRFToken, xsrfHeaderName, xsrfCookieName, newConfig)
  ) {
    // Fetch strips only Authorization when a redirect leaves the origin, so following one would
    // send the XSRF token to whatever host it points at. Refuse redirects unless the caller chose.
    const fetchOptions = own("fetchOptions") as Record<string, unknown> | undefined;
    if (!utils.isObject(fetchOptions) || !utils.hasOwnProp(fetchOptions, "redirect")) {
      newConfig.fetchOptions = { ...fetchOptions, redirect: "error" };
    }
  }

  return newConfig;
}

export default prepareRequest;
