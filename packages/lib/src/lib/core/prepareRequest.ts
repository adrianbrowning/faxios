import FaxiosHeaders from "../core/FaxiosHeaders.js";
import resolveRequestURL from "../core/resolveRequestURL.js";
import cloneConfig from "../helpers/cloneConfig.js";
import cookies from "../helpers/cookies.js";
import isURLSameOrigin from "../helpers/isURLSameOrigin.js";
import platform from "../platform.js";
import type { FaxiosRequestConfig } from "../types.js";
import utils from "../utils.js";

const FORM_DATA_CONTENT_HEADERS = [ "content-type", "content-length" ];

function setFormDataHeaders(
  headers: FaxiosHeaders,
  formHeaders: Record<string, unknown>,
  policy: unknown
): void {
  if (policy !== "content-only") {
    headers.set(formHeaders);
    return;
  }
  /* eslint-disable big-o/no-array-lookup-in-loop -- 2-element constant array */
  Object.entries(formHeaders).forEach(([ key, val ]) => {
    if (FORM_DATA_CONTENT_HEADERS.includes(key.toLowerCase())) {
      headers.set(key, val);
    }
  });
  /* eslint-enable big-o/no-array-lookup-in-loop */
}

function applyXSRFToken(
  headers: FaxiosHeaders,
  withXSRFToken: ((cfg: unknown) => unknown) | boolean | null | undefined,
  xsrfHeaderName: string | undefined,
  xsrfCookieName: string | undefined,
  config: FaxiosRequestConfig
): void {
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
    utils.hasOwnProp(newConfig, key)
      ? (newConfig as Record<string, unknown>)[key]
      : undefined;

  const data = own("data");
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

  if (utils.isFormData(data)) {
    if (
      platform.hasStandardBrowserEnv ||
      platform.hasStandardBrowserWebWorkerEnv ||
      utils.isReactNative(data)
    ) {
      (headers.setContentType as (v: unknown) => unknown)(undefined); // browser/web worker/RN handles it
    }
    else if (
      utils.isFunction((data as Record<string, unknown>)["getHeaders"])
    ) {
      // Node.js FormData (like form-data package)
      setFormDataHeaders(
        headers,
        (data as { getHeaders: () => Record<string, unknown>; }).getHeaders(),
        own("formDataHeaderPolicy")
      );
    }
  }

  // Add xsrf header
  // This is only done if running in a standard browser environment.
  // Specifically not if we're in a web worker, or react-native.
  if (platform.hasStandardBrowserEnv) {
    applyXSRFToken(headers, withXSRFToken, xsrfHeaderName, xsrfCookieName, newConfig);
  }

  return newConfig;
}

export default prepareRequest;
