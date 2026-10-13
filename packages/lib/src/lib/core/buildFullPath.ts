// @ts-self-types="./buildFullPath.d.ts" — required for Deno: published as an unsafe/* export
"use strict";

import combineURLs from "../helpers/combineURLs.js";
import isAbsoluteURL from "../helpers/isAbsoluteURL.js";
import type { InternalFaxiosRequestConfig } from "../types.js";
import FaxiosError from "./FaxiosError.js";

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
    throw new FaxiosError(
      "Invalid URL: missing \"//\" after protocol",
      FaxiosError.ERR_INVALID_URL,
      config as InternalFaxiosRequestConfig
    );
  }
}

/**
 * Creates a new URL by combining the baseURL with the requestedURL when the requestedURL is
 * relative. An absolute requestedURL is returned untouched, unless a baseURL is set and
 * `allowAbsoluteUrls` is `false`: then it throws `ERR_INVALID_URL` rather than send the
 * request somewhere the caller didn't mean.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 *
 * @returns {string} The combined full path
 */
export default function buildFullPath(baseURL: unknown, requestedURL: unknown, allowAbsoluteUrls?: unknown, config?: unknown): string {
  assertValidHttpProtocolURL(requestedURL, config);
  if (!baseURL) return requestedURL as string;
  if (isAbsoluteURL(requestedURL)) {
    if (allowAbsoluteUrls === false) {
      throw new FaxiosError(
        "absolute URL with baseURL; set allowAbsoluteUrls: true",
        FaxiosError.ERR_INVALID_URL,
        config as InternalFaxiosRequestConfig
      );
    }
    return requestedURL as string;
  }
  assertValidHttpProtocolURL(baseURL, config);
  return combineURLs(baseURL as string, requestedURL as string);
}
