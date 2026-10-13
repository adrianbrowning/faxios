// @ts-self-types="./buildURL.d.ts" — required for Deno: published as an unsafe/* export
"use strict";

import { appendParams } from "./appendParams.js";
import { serializeFormParams } from "./FaxiosURLSearchParams.js";

// eslint-disable-next-line no-barrel-files/no-barrel-files -- the unsafe/helpers/buildURL.js export has always exported encode
export { encode } from "./appendParams.js";

/**
 * Build a URL by appending params to the end, serializing nested params like
 * `@gcmdev/faxios/form` does.
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @param {?(object|Function)} options
 *
 * @returns {string} The formatted url
 */
export default function buildURL(url: string, params?: unknown, options?: unknown): string {
  return appendParams(url, params, options, serializeFormParams);
}
