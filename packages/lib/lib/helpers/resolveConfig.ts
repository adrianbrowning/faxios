import AxiosHeaders from "../core/AxiosHeaders.js";
import buildFullPath from "../core/buildFullPath.js";
import mergeConfig from "../core/mergeConfig.js";
import platform from "../platform/index.js";
import type { AxiosRequestConfig } from "../types.js";
import utils from "../utils.js";
import buildURL from "./buildURL.js";
import cookies from "./cookies.js";
import isURLSameOrigin from "./isURLSameOrigin.js";

const FORM_DATA_CONTENT_HEADERS = [ "content-type", "content-length" ];

function setFormDataHeaders(
  headers: AxiosHeaders,
  formHeaders: Record<string, unknown>,
  policy: unknown
): void {
  if (policy !== "content-only") {
    headers.set(formHeaders);
    return;
  }

  Object.entries(formHeaders).forEach(([ key, val ]) => {
    if (FORM_DATA_CONTENT_HEADERS.includes(key.toLowerCase())) {
      headers.set(key, val);
    }
  });
}

/**
 * Encode a UTF-8 string to a Latin-1 byte string for use with btoa().
 * This is a modern replacement for the deprecated unescape(encodeURIComponent(str)) pattern.
 *
 * @param {string} str The string to encode
 *
 * @returns {string} UTF-8 bytes as a Latin-1 string
 */
const encodeUTF8 = (str: string): string =>
  encodeURIComponent(str).replace(
    /%([0-9A-F]{2})/gi,
    (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))
  );

function applyXSRFToken(
  headers: AxiosHeaders,
  withXSRFToken: ((cfg: unknown) => unknown) | boolean | null | undefined,
  xsrfHeaderName: string | undefined,
  xsrfCookieName: string | undefined,
  config: AxiosRequestConfig
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

function resolveConfig(config: AxiosRequestConfig): AxiosRequestConfig {
  const newConfig = mergeConfig({}, config);

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
  const auth = own("auth");
  const baseURL = own("baseURL");
  const allowAbsoluteUrls = own("allowAbsoluteUrls");
  const url = own("url");

  const headers: AxiosHeaders = AxiosHeaders.from(
    own("headers") as Record<string, unknown> | null | undefined
  );
  newConfig.headers = headers;

  newConfig.url = buildURL(
    buildFullPath(baseURL, url, allowAbsoluteUrls, newConfig),
    own("params"),
    own("paramsSerializer")
  );

  // HTTP basic authentication
  if (auth) {
    const username = String(utils.getSafeProp(auth, "username") || "");
    const password = String(utils.getSafeProp(auth, "password") || "");

    headers.set(
      "Authorization",
      "Basic " +
        (
          (globalThis as Record<string, unknown>)["btoa"] as (
            s: string
          ) => string
        )(username + ":" + (password ? encodeUTF8(password) : ""))
    );
  }

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

export default resolveConfig;
