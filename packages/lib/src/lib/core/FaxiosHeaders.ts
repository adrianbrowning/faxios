"use strict";

import parseHeaders from "../helpers/parseHeaders.js";
import { sanitizeHeaderValue } from "../helpers/sanitizeHeaderValue.js";
import type { FaxiosHeaderValue } from "../types.js";
import utils from "../utils.js";

const $internals = Symbol("internals");

type HeaderMatcher =
  | string
  | RegExp
  | ((this: FaxiosHeaders, value: string, name: string) => boolean);

type RewriteOption =
  | boolean
  | ((this: FaxiosHeaders, value: string, name: string) => boolean);

type HeaderInput =
  | Record<string, unknown>
  | FaxiosHeaders
  | string
  | undefined
  | null;

function normalizeHeader(header: string): string {
  return header && String(header).trim()
    .toLowerCase();
}

// eslint-disable-next-line sonarjs/function-return-type
function normalizeValue(
  value: FaxiosHeaderValue | undefined
): string | Array<string> | false | null | undefined {
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
  filter:
    | string
    | RegExp
    | ((this: FaxiosHeaders, value: string, name: string) => boolean)
    | undefined,
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

class FaxiosHeaders {
  [key: string]: unknown;

  // Accessors generated at runtime by FaxiosHeaders.accessor([...]) below.
  // Declared here so consumers get real types instead of the index signature.
  declare getContentType: (matcher?: HeaderMatcher) => FaxiosHeaderValue | undefined;
  declare setContentType: (value: FaxiosHeaderValue, rewrite?: RewriteOption) => this;
  declare hasContentType: (matcher?: HeaderMatcher) => boolean;
  declare getContentLength: (matcher?: HeaderMatcher) => FaxiosHeaderValue | undefined;
  declare setContentLength: (value: FaxiosHeaderValue, rewrite?: RewriteOption) => this;
  declare hasContentLength: (matcher?: HeaderMatcher) => boolean;
  declare getAccept: (matcher?: HeaderMatcher) => FaxiosHeaderValue | undefined;
  declare setAccept: (value: FaxiosHeaderValue, rewrite?: RewriteOption) => this;
  declare hasAccept: (matcher?: HeaderMatcher) => boolean;
  declare getAcceptEncoding: (matcher?: HeaderMatcher) => FaxiosHeaderValue | undefined;
  declare setAcceptEncoding: (value: FaxiosHeaderValue, rewrite?: RewriteOption) => this;
  declare hasAcceptEncoding: (matcher?: HeaderMatcher) => boolean;
  declare getUserAgent: (matcher?: HeaderMatcher) => FaxiosHeaderValue | undefined;
  declare setUserAgent: (value: FaxiosHeaderValue, rewrite?: RewriteOption) => this;
  declare hasUserAgent: (matcher?: HeaderMatcher) => boolean;
  declare getAuthorization: (matcher?: HeaderMatcher) => FaxiosHeaderValue | undefined;
  declare setAuthorization: (value: FaxiosHeaderValue, rewrite?: RewriteOption) => this;
  declare hasAuthorization: (matcher?: HeaderMatcher) => boolean;

  constructor(
    headers?: Record<string, unknown> | FaxiosHeaders | string | null
  ) {
    headers && this.set(headers);
  }

  set(
    header: HeaderInput,
    valueOrRewrite?: unknown,
    rewrite?: RewriteOption
  ): this {
    const self = this;

    function setHeader(
      _value: unknown,
      _header: string,
      _rewrite: unknown
    ): void {
      const lHeader = normalizeHeader(_header);

      if (!lHeader) {
        return;
      }

      const key = utils.findKey(self, lHeader) as string | undefined;

      if (
        !key ||
        (self as Record<string, unknown>)[key] === undefined ||
        _rewrite === true ||
        (_rewrite === undefined &&
          (self as Record<string, unknown>)[key] !== false &&
          (self as Record<string, unknown>)[key] !== null)
      ) {
        (self as Record<string, unknown>)[key || _header] = normalizeValue(
          _value as FaxiosHeaderValue
        );
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
  get(header: string, parser: RegExp): RegExpExecArray | null | undefined;
  get<R>(header: string, parser: (this: FaxiosHeaders, value: FaxiosHeaderValue, header: string) => R): R | undefined;
  get(
    header: string,
    parser?:
      | RegExp
      | ((
        this: FaxiosHeaders,
        value: FaxiosHeaderValue,
        header: string
      ) => unknown)
      | true
  ): unknown {
    header = normalizeHeader(header);

    if (header) {
      const key = utils.findKey(this, header) as string | undefined;

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
          return (
            parser as (
              this: FaxiosHeaders,
              value: FaxiosHeaderValue,
              header: string
            ) => unknown
          ).call(this, value, key);
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
      const key = utils.findKey(this, header) as string | undefined;

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

  delete(header: string | Array<string>, matcher?: HeaderMatcher): boolean {
    const self = this;
    let deleted = false;

    function deleteHeader(_header: string): void {
      _header = normalizeHeader(_header);

      if (_header) {
        const key = utils.findKey(self, _header) as string | undefined;

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
    const headers: Record<string, unknown> = {};

    utils.forEach(this, (value: unknown, _header: unknown) => {
      const header = _header as string;
      const key = utils.findKey(headers, header) as string | undefined;

      if (key) {
        (self as Record<string, unknown>)[key] = normalizeValue(
          value as FaxiosHeaderValue
        );
        delete (self as Record<string, unknown>)[header];
        return;
      }

      const normalized = format ? formatHeader(header) : String(header).trim();

      if (normalized !== header) {
        delete (self as Record<string, unknown>)[header];
      }

      (self as Record<string, unknown>)[normalized] = normalizeValue(
        value as FaxiosHeaderValue
      );

      headers[normalized] = true;
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
    return (this.get("set-cookie") as Array<string> | null) ?? [];
  }

  get [Symbol.toStringTag](): string {
    return "FaxiosHeaders";
  }

  static from(
    thing?: Record<string, unknown> | FaxiosHeaders | string | null
  ): FaxiosHeaders {
    return thing instanceof this ? thing : new this(thing);
  }

  static concat(
    first: Record<string, unknown> | FaxiosHeaders | string | undefined | null,
    ...targets: Array<
      Record<string, unknown> | FaxiosHeaders | string | undefined | null
    >
  ): FaxiosHeaders {
    const computed = new this(first);

    targets.forEach(target => computed.set(target));

    return computed;
  }

  static accessor(header: string | Array<string>): typeof FaxiosHeaders {
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

    utils.isArray(header)
      ? header.forEach(defineAccessor)
      : defineAccessor(header);

    return this;
  }
}

FaxiosHeaders.accessor([
  "Content-Type",
  "Content-Length",
  "Accept",
  "Accept-Encoding",
  "User-Agent",
  "Authorization",
]);

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
