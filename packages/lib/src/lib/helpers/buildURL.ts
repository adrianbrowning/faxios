"use strict";

import type { ParamEncoder } from "../types.js";
import utils from "../utils.js";
import FaxiosURLSearchParams from "./FaxiosURLSearchParams.js";

/**
 * It replaces URL-encoded forms of `:`, `$`, `,`, and spaces with
 * their plain counterparts (`:`, `$`, `,`, `+`).
 *
 * @param {string} val The value to be encoded.
 *
 * @returns {string} The encoded value.
 */
export function encode(val: string): string {
  return encodeURIComponent(val)
    .replace(/%3A/gi, ":")
    .replace(/%24/g, "$")
    .replace(/%2C/gi, ",")
    .replace(/%20/g, "+");
}

// The request path validates `paramsSerializer.encode` as a function; this
// guard narrows the untyped option to ParamEncoder without asserting it.
function isParamEncoder(value: unknown): value is ParamEncoder {
  return typeof value === "function";
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @param {?(object|Function)} options
 *
 * @returns {string} The formatted url
 */
export default function buildURL(url: string, params?: unknown, options?: unknown): string {
  if (!params) {
    return url;
  }

  const _options = utils.isFunction(options)
    ? {
      serialize: options,
    }
    : options;

  // Read serializer options pollution-safely: own properties and methods on a
  // class/template prototype are honored, but values injected onto a polluted
  // Object.prototype are ignored.
  const customEncode = utils.getSafeProp(_options, "encode");
  const _encode: ParamEncoder = isParamEncoder(customEncode) ? customEncode : encode;
  const serializeFn = utils.getSafeProp(_options, "serialize") as ((params: unknown, options: unknown) => string) | undefined;

  let serializedParams: string | undefined;

  if (serializeFn) {
    serializedParams = serializeFn(params, _options);
  }
  else {
    serializedParams = utils.isURLSearchParams(params)
      ? (params as { toString: () => string; }).toString()
      : new FaxiosURLSearchParams(params, _options).toString(_encode);
  }

  if (serializedParams) {
    const hashmarkIndex = url.indexOf("#");

    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }
    url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
  }

  return url;
}
