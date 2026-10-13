import FaxiosHeaders from "../core/FaxiosHeaders.js";
import resolveRequestURL from "../core/resolveRequestURL.js";
import cloneConfig from "../helpers/cloneConfig.js";
import cookies from "../helpers/cookies.js";
import isURLSameOrigin from "../helpers/isURLSameOrigin.js";
import platform from "../platform.js";
import type { FaxiosRequestConfig } from "../types.js";
import { hasOwnProp, isFunction } from "../utils.js";

function applyXSRFToken(
  headers: FaxiosHeaders,
  withXSRFToken: ((cfg: unknown) => unknown) | boolean | null | undefined,
  xsrfHeaderName: string | undefined,
  xsrfCookieName: string | undefined,
  config: FaxiosRequestConfig
): void {
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
    (withXSRFToken == null && isURLSameOrigin(config.url ?? ""));

  if (shouldSendXSRF) {
    const xsrfValue =
      xsrfHeaderName && xsrfCookieName && cookies.read(xsrfCookieName);

    if (xsrfValue) {
      headers.set(xsrfHeaderName, xsrfValue);
    }
  }
}

function prepareRequest(config: FaxiosRequestConfig): FaxiosRequestConfig {
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

  const headers: FaxiosHeaders = FaxiosHeaders.from(
    own("headers") as null | Record<string, unknown> | undefined
  );
  newConfig.headers = headers;

  newConfig.url = resolveRequestURL(newConfig);

  // Add xsrf header
  // This is only done if running in a standard browser environment.
  // Specifically not if we're in a web worker, or react-native.
  if (platform.hasStandardBrowserEnv) {
    applyXSRFToken(headers, withXSRFToken, xsrfHeaderName, xsrfCookieName, newConfig);
  }

  return newConfig;
}

export default prepareRequest;
