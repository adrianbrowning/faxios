// @ts-self-types="./FaxiosHeaders.d.ts" — required for Deno: types.d.ts imports FaxiosHeadersInstance from here
"use strict";

import parseHeaders from "../helpers/parseHeaders.js";
import { sanitizeHeaderValue } from "../helpers/sanitizeHeaderValue.js";
import type { FaxiosHeaderValue } from "../types.js";
import utils from "../utils.js";

const $internals = Symbol("internals");

/** Matches a header value for `has()`, `delete()`, `clear()` and the `has<Header>` shortcuts. */
type HeaderMatcher =
  | ((this: FaxiosHeaders, value: string, name: string) => boolean)
  | RegExp
  | string;

/** Turns a header value into something else, for `get()` and the `get<Header>` shortcuts. */
type HeaderParser<R> = (this: FaxiosHeaders, value: FaxiosHeaderValue, header: string) => R;

/** A `get<Header>` shortcut: `get()` with the header name already filled in. */
interface HeaderGetter {
  (): FaxiosHeaderValue | undefined;
  (parser: true): Record<string, string> | undefined;
  (parser: RegExp): null | RegExpExecArray | undefined;
  <R>(parser: HeaderParser<R>): R | undefined;
}

// The headers that get `get<Header>`, `set<Header>` and `has<Header>` shortcuts. Both the runtime
// registration (FaxiosHeaders.accessor below) and the declarations (HeaderAccessors) come from here.
const ACCESSOR_HEADERS = [
  "Content-Type",
  "Content-Length",
  "Accept",
  "Accept-Encoding",
  "User-Agent",
  "Authorization",
] as const;

type AccessorHeader = (typeof ACCESSOR_HEADERS)[number];
// "Accept-Encoding" -> "AcceptEncoding", matching utils.toCamelCase(" " + header) at runtime.
type AccessorSuffix<H extends string> = H extends `${infer Head}-${infer Rest}` ? `${Head}${AccessorSuffix<Rest>}` : H;

type HeaderAccessors =
  & { [H in AccessorHeader as `get${AccessorSuffix<H>}`]: HeaderGetter; }
  & { [H in AccessorHeader as `has${AccessorSuffix<H>}`]: (matcher?: HeaderMatcher) => boolean; }
  & { [H in AccessorHeader as `set${AccessorSuffix<H>}`]: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosHeaders; };

type HeaderInput =
  | FaxiosHeaders
  | null
  | Record<string, unknown>
  | string
  | undefined;

/** Matches a `FaxiosHeaders` instance by its type-only brand. */
export type FaxiosHeadersInstance = Pick<FaxiosHeaders, typeof faxiosHeadersBrand>;

function normalizeHeader(header: string): string {
  return header && String(header).trim()
    .toLowerCase();
}

// Per instance: lowercased own key -> own key. Callers may also write and delete headers as plain
// properties, so an entry is only trusted while its key is still own, and a miss rebuilds the index.
const keyIndexes = new WeakMap<object, Map<string, string>>();

function indexKeys(headers: object): Map<string, string> {
  const index = new Map<string, string>();
  // Later keys overwrite earlier ones, matching utils.findKey, which scans from the end.
  for (const key of Object.keys(headers)) {
    index.set(key.toLowerCase(), key);
  }
  keyIndexes.set(headers, index);
  return index;
}

function findHeaderKey(headers: object, lHeader: string): string | undefined {
  const key = keyIndexes.get(headers)?.get(lHeader);
  return key !== undefined && utils.hasOwnProp(headers, key) ? key : indexKeys(headers).get(lHeader);
}

// Per instance: own key -> the string set() or normalize() last sanitized into it. Sanitizing is
// idempotent, so a value still equal to that string needs no second pass; a value written as a
// plain property differs and is sanitized as usual. Arrays are always sanitized again: they can
// be changed in place.
const sanitizedValues = new WeakMap<object, Map<string, string>>();

function sanitizedValuesOf(headers: object): Map<string, string> {
  let values = sanitizedValues.get(headers);
  if (!values) {
    values = new Map();
    sanitizedValues.set(headers, values);
  }
  return values;
}

// Writes `value` under `key`, sanitized unless `clean` says it already is.
function storeValue(headers: object, values: Map<string, string>, key: string, value: unknown, clean: boolean): void {
  const stored = clean ? value : normalizeValue(value as FaxiosHeaderValue);
  (headers as Record<string, unknown>)[key] = stored;
  if (typeof stored === "string") values.set(key, stored);
  else values.delete(key);
}

// eslint-disable-next-line sonarjs/function-return-type
function normalizeValue(
  value: FaxiosHeaderValue | undefined
): Array<string> | false | null | string | undefined {
  if (value == null) {
    return value;
  }
  if (value === false) {
    return false;
  }
  if (utils.isArray(value)) {
    return (value as Array<FaxiosHeaderValue>).map(normalizeValue) as Array<string>;
  }
  return sanitizeHeaderValue(String(value));
}

function parseTokens(str: string): Record<string, string> {
  const tokens: Record<string, string> = Object.create(null);
  const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let match;

  while ((match = tokensRE.exec(str))) {
    tokens[match[1]!] = match[2]!;
  }

  return tokens;
}

const isValidHeaderName = (str: string): boolean =>
  /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());

function matchHeaderValue(
  context: FaxiosHeaders,
  value: unknown,
  header: string,
  filter: HeaderMatcher | undefined,
  isHeaderNameFilter?: boolean
): boolean | undefined {
  if (utils.isFunction(filter)) {
    return (
      filter as (this: FaxiosHeaders, value: string, name: string) => boolean
    ).call(context, value as string, header);
  }

  if (isHeaderNameFilter) {
    value = header;
  }

  if (!utils.isString(value)) return undefined;

  if (utils.isString(filter)) {
    return (value as string).indexOf(filter as string) !== -1;
  }

  if (utils.isRegExp(filter)) {
    return (filter as RegExp).test(value as string);
  }
  return undefined;
}

function formatHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/([a-z\d])(\w*)/g, (_w, char, str) => char.toUpperCase() + str);
}

function iterableToHeaders(header: Iterable<unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = Object.create(null);
  for (const entry of header) {
    if (!utils.isArray(entry)) {
      throw new TypeError("Object iterator must return a key-value pair");
    }
    const key = (entry as Array<unknown>)[0] as string;
    const val = (entry as Array<unknown>)[1];
    if (utils.hasOwnProp(obj, key)) {
      const dest = obj[key];
      obj[key] = utils.isArray(dest) ? [ ...(dest as Array<unknown>), val ] : [ dest, val ];
    }
    else {
      obj[key] = val;
    }
  }
  return obj;
}

function buildAccessors(obj: object, header: string): void {
  const accessorName = utils.toCamelCase(" " + header);

  [ "get", "set", "has" ].forEach(methodName => {
    Object.defineProperty(
      obj,
      methodName + accessorName,
      Object.assign(Object.create(null) as PropertyDescriptor, {
        value: function (
          this: FaxiosHeaders,
          arg1: unknown,
          arg2: unknown,
          arg3: unknown
        ) {
          return (
            this as unknown as Record<
              string,
              ((...args: Array<unknown>) => unknown) | undefined
            >
          )[methodName]!.call(this, header, arg1, arg2, arg3);
        },
        configurable: true,
      })
    );
  });
}

declare const faxiosHeadersBrand: unique symbol;

// The get/set/has<Header> shortcuts that FaxiosHeaders.accessor(ACCESSOR_HEADERS) registers at runtime,
// merged into the class below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging adds HeaderAccessors to the class
interface FaxiosHeaders extends HeaderAccessors {}

class FaxiosHeaders {
  [key: string]: unknown;

  // Type-only brand (nothing at runtime): lets config types accept an instance
  // without its index signature or method names leaking into header-name completions.
  declare readonly [faxiosHeadersBrand]: true;

  constructor(
    headers?: FaxiosHeaders | null | Record<string, unknown> | string
  ) {
    headers && this.set(headers);
  }

  set(
    header: HeaderInput,
    valueOrRewrite?: unknown,
    rewrite?: boolean
  ): this {
    const self = this;
    const values = sanitizedValuesOf(self);
    // A FaxiosHeaders source has sanitized its values already; only those still as it left them
    // are copied without another pass.
    const sourceValues = header instanceof this.constructor ? sanitizedValues.get(header) : undefined;
    // Set once a lookup misses, which rebuilds the index from the own keys. Only setHeader writes
    // to self until this call returns, so from then on the index is complete and a miss is final.
    let index: Map<string, string> | undefined;

    function setHeader(
      _value: unknown,
      _header: string,
      _rewrite: unknown
    ): void {
      const lHeader = normalizeHeader(_header);

      // Header names are stored as own properties, so names that would reach the prototype are skipped.
      if (!lHeader || utils.isDangerousKey(lHeader)) {
        return;
      }

      const key = index ? index.get(lHeader) : findHeaderKey(self, lHeader);
      if (key === undefined) {
        index ??= keyIndexes.get(self)!;
        index.set(String(_header).toLowerCase(), _header);
      }

      if (
        !key ||
        (self as Record<string, unknown>)[key] === undefined ||
        _rewrite === true ||
        (_rewrite === undefined &&
          (self as Record<string, unknown>)[key] !== false &&
          (self as Record<string, unknown>)[key] !== null)
      ) {
        storeValue(self, values, key || _header, _value, typeof _value === "string" && sourceValues?.get(_header) === _value);
      }
    }

    const setHeaders = (headers: object, _rewrite: unknown): void =>
      utils.forEach(headers, (_value: unknown, _header: unknown) =>
        setHeader(_value, _header as string, _rewrite)
      );

    if (utils.isPlainObject(header) || header instanceof this.constructor) {
      setHeaders(header as object, valueOrRewrite);
    }
    else if (utils.isString(header)) {
      header = (header as string).trim();
      if (!isValidHeaderName(header)) {
        setHeaders(parseHeaders(header), valueOrRewrite);
      }
      else {
        setHeader(valueOrRewrite, header, rewrite);
      }
    }
    else if (utils.isObject(header) && utils.isSafeIterable(header)) {
      setHeaders(iterableToHeaders(header as Iterable<unknown>), valueOrRewrite);
    }
    else {
      header != null && setHeader(valueOrRewrite, header as string, rewrite);
    }

    return this;
  }

  get(header: string): FaxiosHeaderValue | undefined;
  get(header: string, parser: true): Record<string, string> | undefined;
  get(header: string, parser: RegExp): null | RegExpExecArray | undefined;
  get<R>(header: string, parser: HeaderParser<R>): R | undefined;
  get(
    header: string,
    parser?: HeaderParser<unknown> | RegExp | true
  ): unknown {
    header = normalizeHeader(header);

    if (header) {
      const key = findHeaderKey(this, header);

      if (key) {
        const value = (this as Record<string, unknown>)[
          key
        ] as FaxiosHeaderValue;

        if (!parser) {
          return value;
        }

        if (parser === true) {
          return parseTokens(value as string);
        }

        if (utils.isFunction(parser)) {
          return (parser as HeaderParser<unknown>).call(this, value, key);
        }

        if (utils.isRegExp(parser)) {
          return (parser as RegExp).exec(value as string);
        }

        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
    return undefined;
  }

  has(header: string, matcher?: HeaderMatcher): boolean {
    header = normalizeHeader(header);

    if (header) {
      const key = findHeaderKey(this, header);

      return !!(
        key &&
        (this as Record<string, unknown>)[key] !== undefined &&
        (!matcher ||
          matchHeaderValue(
            this,
            (this as Record<string, unknown>)[key],
            key,
            matcher
          ))
      );
    }

    return false;
  }

  delete(header: Array<string> | string, matcher?: HeaderMatcher): boolean {
    const self = this;
    let deleted = false;

    function deleteHeader(_header: string): void {
      _header = normalizeHeader(_header);

      if (_header) {
        const key = findHeaderKey(self, _header);

        if (
          key &&
          (!matcher ||
            matchHeaderValue(
              self,
              (self as Record<string, unknown>)[key],
              key,
              matcher
            ))
        ) {
          delete (self as Record<string, unknown>)[key];

          deleted = true;
        }
      }
    }

    if (utils.isArray(header)) {
      header.forEach(deleteHeader);
    }
    else {
      deleteHeader(header);
    }

    return deleted;
  }

  clear(matcher?: HeaderMatcher): boolean {
    const keys = Object.keys(this);
    let i = keys.length;
    let deleted = false;

    while (i--) {
      const key = keys[i]!;
      if (
        !matcher ||
        matchHeaderValue(
          this,
          (this as Record<string, unknown>)[key],
          key,
          matcher,
          true
        )
      ) {
        delete (this as Record<string, unknown>)[key];
        deleted = true;
      }
    }

    return deleted;
  }

  normalize(format: boolean = false): this {
    const self = this;
    const values = sanitizedValuesOf(self);
    // Lowercased normalized name -> normalized name, for names already kept.
    const kept = new Map<string, string>();

    utils.forEach(this, (value: unknown, _header: unknown) => {
      const header = _header as string;
      const key = kept.get(header.toLowerCase());
      const clean = typeof value === "string" && values.get(header) === value;

      if (key) {
        storeValue(self, values, key, value, clean);
        delete (self as Record<string, unknown>)[header];
        values.delete(header);
        return;
      }

      const normalized = format ? formatHeader(header) : String(header).trim();

      if (normalized !== header) {
        delete (self as Record<string, unknown>)[header];
        values.delete(header);
      }

      storeValue(self, values, normalized, value, clean);

      kept.set(normalized.toLowerCase(), normalized);
    });

    return this;
  }

  concat(...targets: Array<HeaderInput>): FaxiosHeaders {
    return (this.constructor as typeof FaxiosHeaders).concat(this, ...targets);
  }

  toJSON(asStrings?: boolean): Record<string, unknown> {
    const obj: Record<string, unknown> = Object.create(null);

    utils.forEach(this, (value: unknown, _header: unknown) => {
      const header = _header as string;
      value != null &&
        value !== false &&
        (obj[header] =
          asStrings && utils.isArray(value)
            ? (value as Array<string>).join(", ")
            : value);
    });

    return obj;
  }

  [Symbol.iterator](): IterableIterator<[string, unknown]> {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }

  toString(): string {
    return Object.entries(this.toJSON())
      .map(([ header, value ]) => header + ": " + value)
      .join("\n");
  }

  getSetCookie(): Array<string> {
    const value = this.get("set-cookie");
    if (value == null) {
      return [];
    }
    return Array.isArray(value) ? value.map(String) : [ String(value) ];
  }

  get [Symbol.toStringTag](): string {
    return "FaxiosHeaders";
  }

  static from(
    thing?: FaxiosHeaders | null | Record<string, unknown> | string
  ): FaxiosHeaders {
    return thing instanceof this ? thing : new this(thing);
  }

  static concat(
    first: FaxiosHeaders | null | Record<string, unknown> | string | undefined,
    ...targets: Array<
      FaxiosHeaders | null | Record<string, unknown> | string | undefined
    >
  ): FaxiosHeaders {
    const computed = new this(first);

    targets.forEach(target => computed.set(target));

    return computed;
  }

  static accessor(header: ReadonlyArray<string> | string): typeof FaxiosHeaders {
    const self = this as unknown as Record<
      symbol,
      { accessors: Record<string, boolean>; }
    >;
    const internals =
      (self[$internals] =
        self[$internals] =
          {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            accessors: {} as Record<string, boolean>,
          });

    const accessors = internals.accessors;
    const prototype = this.prototype;

    function defineAccessor(_header: string): void {
      const lHeader = normalizeHeader(_header);

      if (!accessors[lHeader]) {
        buildAccessors(prototype, _header);
        accessors[lHeader] = true;
      }
    }

    typeof header === "string"
      ? defineAccessor(header)
      : header.forEach(defineAccessor);

    return this;
  }
}

FaxiosHeaders.accessor(ACCESSOR_HEADERS);

// reserved names hotfix
utils.reduceDescriptors(
  FaxiosHeaders.prototype,
  ({ value }: PropertyDescriptor, key: string) => {
    let mapped = key[0]!.toUpperCase() + key.slice(1); // map `set` => `Set`
    return {
      get: () => value,
      set(this: Record<string, unknown>, headerValue: unknown) {
        this[mapped] = headerValue;
      },
    };
  }
);

utils.freezeMethods(FaxiosHeaders);

export default FaxiosHeaders;
