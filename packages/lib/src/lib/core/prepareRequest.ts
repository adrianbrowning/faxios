import buildFullPath from "../core/buildFullPath.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import buildURL from "../helpers/buildURL.js";
import cookies from "../helpers/cookies.js";
import isURLSameOrigin from "../helpers/isURLSameOrigin.js";
import platform from "../platform.js";
import type { FaxiosRequestConfig } from "../types.js";
import utils from "../utils.js";

const DANGEROUS_KEYS = new Set([ "__proto__", "constructor", "prototype" ]);

// ponytail: null-proto shallow clone; replaces mergeConfig({}, config) which ran the full
// two-config merge machinery just to get a defensive copy. Security invariants preserved:
// null-proto so fetch.ts destructuring can't inherit Object.prototype gadgets, and
// dangerous keys filtered to block prototype-pollution write paths.
function cloneConfig(src: FaxiosRequestConfig): FaxiosRequestConfig & Record<string, unknown> {
  const dst = Object.create(null) as FaxiosRequestConfig & Record<string, unknown>;
  Object.defineProperty(dst, "hasOwnProperty", Object.assign(Object.create(null) as PropertyDescriptor, {
    value: Object.prototype.hasOwnProperty,
    writable: true,
    configurable: true,
    enumerable: false,
  }));
  for (const key of Object.keys(src)) {
    if (!DANGEROUS_KEYS.has(key)) {
      (dst as Record<string, unknown>)[key] = (src as Record<string, unknown>)[key];
    }
  }
  return dst;
}

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
  const auth = own("auth");
  const baseURL = own("baseURL");
  const allowAbsoluteUrls = own("allowAbsoluteUrls");
  const url = own("url");

  const headers: FaxiosHeaders = FaxiosHeaders.from(
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

export default prepareRequest;
