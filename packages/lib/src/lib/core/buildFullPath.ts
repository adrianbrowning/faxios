"use strict";

import combineURLs from "../helpers/combineURLs.js";
import isAbsoluteURL from "../helpers/isAbsoluteURL.js";
import type { InternalAxiosRequestConfig } from "../types.js";
import AxiosError from "./AxiosError.js";

const malformedHttpProtocol = /^https?:(?!\/\/)/i;
const httpProtocolControlCharacters = /[\t\n\r]/g;

function stripLeadingC0ControlOrSpace(url: string): string {
  let i = 0;
  while (i < url.length && url.charCodeAt(i) <= 0x20) {
    i++;
  }
  return url.slice(i);
}

function normalizeURLForProtocolCheck(url: string): string {
  return stripLeadingC0ControlOrSpace(url).replace(httpProtocolControlCharacters, "");
}

function assertValidHttpProtocolURL(url: unknown, config: unknown): void {
  if (typeof url === "string" && malformedHttpProtocol.test(normalizeURLForProtocolCheck(url))) {
    throw new AxiosError(
      "Invalid URL: missing \"//\" after protocol",
      AxiosError.ERR_INVALID_URL,
      config as InternalAxiosRequestConfig
    );
  }
}

/**
 * Creates a new URL by combining the baseURL with the requestedURL,
 * only when the requestedURL is not already an absolute URL.
 * If the requestURL is absolute, this function returns the requestedURL untouched.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 *
 * @returns {string} The combined full path
 */
export default function buildFullPath(baseURL: unknown, requestedURL: unknown, allowAbsoluteUrls?: unknown, config?: unknown): string {
  assertValidHttpProtocolURL(requestedURL, config);
  let isRelativeUrl = !isAbsoluteURL(requestedURL);
  if (baseURL && (isRelativeUrl || allowAbsoluteUrls === false)) {
    assertValidHttpProtocolURL(baseURL, config);
    return combineURLs(baseURL as string, requestedURL as string);
  }
  return requestedURL as string;
}
