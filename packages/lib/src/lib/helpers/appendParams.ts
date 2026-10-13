// @ts-self-types="./appendParams.d.ts" — required for Deno: buildURL.ts (an unsafe/* export) re-exports encode from here
// Appends `params` to a URL. The request path uses this with core's flat serializer below, or with
// the toFormData-based one `@gcmdev/faxios/form` installs; `buildURL.ts` (the unsafe export) is
// the latter.

import FaxiosError from "../core/FaxiosError.js";
import type { ParamEncoder } from "../types.js";
import { forEach, getSafeProp, isArray, isArrayBuffer, isBlob, isDate, isFileList, isFunction, isObject, isPlainObject, isTypedArray, isURLSearchParams, toArray } from "../utils.js";

/** Serializes `params` with `encoder`; `options` is the request's `paramsSerializer` object. */
export type ParamsSerializer = (params: unknown, options: unknown, encoder: ParamEncoder) => string;

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

/** The default encoder a custom `paramsSerializer.encode` receives: every reserved character encoded, spaces as `+`. */
export function encodeParam(str: string): string {
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

function nestedParamsError(key: string): FaxiosError {
  return new FaxiosError(
    `params.${key} is nested; nested params need @gcmdev/faxios/form; install it with use(form()), or pass a paramsSerializer`,
    FaxiosError.ERR_NOT_SUPPORT
  );
}

// The elements toFormData writes one pair each for: a flat array, a FileList, or an array-like
// under a `[]` key. `null` for any other value.
function listOf(value: object, key: string): Array<unknown> | null {
  if (isArray(value) && !value.some(el => isPlainObject(el) || isArray(el))) return value;
  return isFileList(value) || key.endsWith("[]") ? toArray(value) : null;
}

/**
 * Core's `params` serializer: the output of the toFormData-based one for one level of keys
 * (`key=value`, and `key[]=value` per element of an array of plain values, or `key[0]` with
 * `indexes: true` and `key` with `indexes: null`). A nested object, a `{}` meta-token key or a
 * `visitor` needs that serializer, so they reject with `ERR_NOT_SUPPORT`.
 */
export function serializeFlatParams(params: unknown, options: unknown, encoder: ParamEncoder): string {
  if (!isObject(params)) throw new FaxiosError("target must be an object", FaxiosError.ERR_BAD_REQUEST);
  if (getSafeProp(options, "visitor") !== undefined) throw nestedParamsError("visitor");
  const indexes = getSafeProp(options, "indexes");
  const dots = getSafeProp(options, "dots");
  const pairs: Array<string> = [];

  function append(key: string, value: unknown): void {
    if (isBlob(value) || isArrayBuffer(value) || isTypedArray(value)) {
      throw new FaxiosError(
        "Binary FormData values need a spec-compliant FormData and a Blob constructor (set the `Blob` option)",
        FaxiosError.ERR_NOT_SUPPORT
      );
    }
    // isDate holds for a Date from another realm too, but isn't a type guard.
    const date = isDate(value) ? value as Date : null;
    const text = date ? date.toISOString() : String(value);
    pairs.push(encoder(key, encodeParam) + "=" + encoder(text, encodeParam));
  }

  forEach(params, function each(value: unknown, rawKey: unknown) {
    if (value === undefined || value === null) return;
    const key = typeof rawKey === "string" ? rawKey.trim() : String(rawKey);
    const list = typeof value === "object" && !isDate(value) ? listOf(value, key) : null;
    if (key.endsWith("{}") && typeof value === "object") throw nestedParamsError(key);
    if (list) {
      const name = key.endsWith("[]") ? key.slice(0, -2) : key;
      list.forEach((el, index) => {
        if (el === undefined || el === null) return;
        if (indexes === true) append(dots ? `${name}.${index}` : `${name}[${index}]`, el);
        else append(indexes === null ? name : `${name}[]`, el);
      });
      return;
    }
    if (isPlainObject(value) || isArray(value)) throw nestedParamsError(key);
    append(key, value);
  });

  return pairs.join("&");
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
 * @param serializeParams Serializes `params` when `options` has no `serialize`
 *
 * @returns {string} The formatted url
 */
export function appendParams(url: string, params: unknown, options: unknown, serializeParams: ParamsSerializer = serializeFlatParams): string {
  if (!params) {
    return url;
  }

  const _options = isFunction(options)
    ? {
      serialize: options,
    }
    : options;

  // Read serializer options pollution-safely: own properties and methods on a
  // class/template prototype are honored, but values injected onto a polluted
  // Object.prototype are ignored.
  const customEncode = getSafeProp(_options, "encode");
  const _encode: ParamEncoder = isParamEncoder(customEncode) ? customEncode : encode;
  const serializeFn = getSafeProp(_options, "serialize") as ((params: unknown, options: unknown) => string) | undefined;

  let serializedParams: string | undefined;

  if (serializeFn) {
    serializedParams = serializeFn(params, _options);
  }
  else {
    serializedParams = isURLSearchParams(params)
      ? String(params)
      : serializeParams(params, _options, _encode);
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
