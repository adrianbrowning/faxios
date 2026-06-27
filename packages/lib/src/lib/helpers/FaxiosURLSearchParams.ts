"use strict";

import toFormData from "./toFormData.js";

/**
 * It encodes a string by replacing all characters that are not in the unreserved set with
 * their percent-encoded equivalents
 *
 * @param {string} str - The string to encode.
 *
 * @returns {string} The encoded string.
 */
function encode(str: string): string {
  const charMap: Record<string, string> = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+",
  };
  return encodeURIComponent(str).replace(/[!'()~]|%20/g, function replacer(match: string) {
    return charMap[match] ?? match;
  });
}

type FaxiosURLSearchParamsInstance = {
  _pairs: Array<[string, unknown]>;
  append: (name: string, value: unknown, options?: unknown) => unknown;
  toString: (encoder?: (value: string, encode: (v: string) => string) => string) => string;
};

/**
 * It takes a params object and converts it to a FormData object
 *
 * @param {Object<string, any>} params - The parameters to be converted to a FormData object.
 * @param {Object<string, any>} options - The options object passed to the Faxios constructor.
 *
 * @returns {void}
 */
function FaxiosURLSearchParams(this: FaxiosURLSearchParamsInstance, params?: unknown, options?: unknown) {
  this._pairs = [];

  params && toFormData(params, this, options as Record<string, unknown>);
}

const prototype = FaxiosURLSearchParams.prototype as FaxiosURLSearchParamsInstance;

prototype.append = function append(this: FaxiosURLSearchParamsInstance, name: string, value: unknown) {
  this._pairs.push([ name, value ]);
};

prototype.toString = function toString(
  this: FaxiosURLSearchParamsInstance,
  encoder?: (value: string, encode: (v: string) => string) => string
): string {
  const _encode = encoder
    ? (value: string) => encoder.call(undefined, value, encode)
    : encode;

  return this._pairs
    .map(function each(pair: [string, unknown]) {
      return _encode(String(pair[0])) + "=" + _encode(String(pair[1]!));
    }, "")
    .join("&");
};

export default FaxiosURLSearchParams;
