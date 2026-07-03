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

class FaxiosURLSearchParams {
  #pairs: Array<[string, unknown]> = [];

  constructor(params?: unknown, options?: unknown) {
    params && toFormData(params, this, options as Record<string, unknown>);
  }

  append(name: string, value: unknown): void {
    this.#pairs.push([ name, value ]);
  }

  toString(encoder?: (value: string, encode: (v: string) => string) => string): string {
    const _encode = encoder
      ? (value: string) => encoder.call(undefined, value, encode)
      : encode;

    return this.#pairs
      .map(function each(pair: [string, unknown]) {
        return _encode(String(pair[0])) + "=" + _encode(String(pair[1]!));
      }, "")
      .join("&");
  }
}

export default FaxiosURLSearchParams;
