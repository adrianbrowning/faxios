"use strict";

import parseHeaders from "../helpers/parseHeaders.js";
import { sanitizeHeaderValue } from "../helpers/sanitizeHeaderValue.js";
import type { AxiosHeaderValue } from "../types.js";
import utils from "../utils.js";

const $internals = Symbol("internals");

type HeaderMatcher =
  | string
  | RegExp
  | ((this: AxiosHeaders, value: string, name: string) => boolean);

type RewriteOption =
  | boolean
  | ((this: AxiosHeaders, value: string, name: string) => boolean);

type HeaderInput = Record<string, unknown> | AxiosHeaders | string | undefined | null;

function normalizeHeader(header: string): string {
  return header && String(header).trim()
    .toLowerCase();
}

function normalizeValue(
  value: AxiosHeaderValue | undefined
): AxiosHeaderValue | undefined {
  if (value === false || value == null) {
    return value;
  }
  if (utils.isArray(value)) {
    return value.map(v => normalizeValue(v) as string);
  }
  return sanitizeHeaderValue(String(value)) as string;
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
  context: AxiosHeaders,
  value: unknown,
  header: string,
  filter:
    | string
    | RegExp
    | ((this: AxiosHeaders, value: string, name: string) => boolean)
    | undefined,
  isHeaderNameFilter?: boolean
): boolean | undefined {
  if (utils.isFunction(filter)) {
    return (
      filter as (this: AxiosHeaders, value: string, name: string) => boolean
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

function buildAccessors(obj: object, header: string): void {
  const accessorName = utils.toCamelCase(" " + header);

  [ "get", "set", "has" ].forEach(methodName => {
    Object.defineProperty(
      obj,
      methodName + accessorName,
      Object.assign(Object.create(null) as PropertyDescriptor, {
        value: function (
          this: AxiosHeaders,
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

class AxiosHeaders {
  [key: string]: unknown;

  constructor(
    headers?: Record<string, unknown> | AxiosHeaders | string | null
  ) {
    headers && this.set(headers);
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
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
          (self as Record<string, unknown>)[key] !== false)
      ) {
        (self as Record<string, unknown>)[key || _header] = normalizeValue(
          _value as AxiosHeaderValue
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
    }
    else if (utils.isObject(header) && utils.isSafeIterable(header)) {
      let obj: Record<string, unknown> = Object.create(null),
        dest: unknown,
        key: string;
      for (const entry of header as Iterable<unknown>) {
        if (!utils.isArray(entry)) {
          throw new TypeError("Object iterator must return a key-value pair");
        }

        key = (entry as Array<unknown>)[0] as string;

        if (utils.hasOwnProp(obj, key)) {
          dest = obj[key];
          obj[key] = utils.isArray(dest)
            ? [ ...(dest as Array<unknown>), (entry as Array<unknown>)[1] ]
            : [ dest, (entry as Array<unknown>)[1] ];
        }
        else {
          obj[key] = (entry as Array<unknown>)[1];
        }
      }

      setHeaders(obj, valueOrRewrite);
    }
    else {
      header != null && setHeader(valueOrRewrite, header as string, rewrite);
    }

    return this;
  }

  get(
    header: string,
    parser?:
      | RegExp
      | ((
        this: AxiosHeaders,
        value: AxiosHeaderValue,
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
        ] as AxiosHeaderValue;

        if (!parser) {
          return value;
        }

        if (parser === true) {
          return parseTokens(value as string);
        }

        if (utils.isFunction(parser)) {
          return (
            parser as (
              this: AxiosHeaders,
              value: AxiosHeaderValue,
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
    return null;
  }

  has(
    header: string,
    matcher?: HeaderMatcher
  ): boolean {
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

  delete(
    header: string | Array<string>,
    matcher?: HeaderMatcher
  ): boolean {
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

  normalize(format: boolean): this {
    const self = this;
    const headers: Record<string, unknown> = {};

    utils.forEach(this, (value: unknown, _header: unknown) => {
      const header = _header as string;
      const key = utils.findKey(headers, header) as string | undefined;

      if (key) {
        (self as Record<string, unknown>)[key] = normalizeValue(
          value as AxiosHeaderValue
        );
        delete (self as Record<string, unknown>)[header];
        return;
      }

      const normalized = format ? formatHeader(header) : String(header).trim();

      if (normalized !== header) {
        delete (self as Record<string, unknown>)[header];
      }

      (self as Record<string, unknown>)[normalized] = normalizeValue(
        value as AxiosHeaderValue
      );

      headers[normalized] = true;
    });

    return this;
  }

  concat(
    ...targets: Array<HeaderInput>
  ): AxiosHeaders {
    return (this.constructor as typeof AxiosHeaders).concat(this, ...targets);
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
    return "AxiosHeaders";
  }

  static from(
    thing?: Record<string, unknown> | AxiosHeaders | string | null
  ): AxiosHeaders {
    return thing instanceof this ? thing : new this(thing);
  }

  static concat(
    first: Record<string, unknown> | AxiosHeaders | string | undefined | null,
    ...targets: Array<
      Record<string, unknown> | AxiosHeaders | string | undefined | null
    >
  ): AxiosHeaders {
    const computed = new this(first);

    targets.forEach(target => computed.set(target));

    return computed;
  }

  static accessor(header: string | Array<string>): typeof AxiosHeaders {
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

AxiosHeaders.accessor([
  "Content-Type",
  "Content-Length",
  "Accept",
  "Accept-Encoding",
  "User-Agent",
  "Authorization",
]);

// reserved names hotfix
utils.reduceDescriptors(
  AxiosHeaders.prototype,
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

utils.freezeMethods(AxiosHeaders);

export default AxiosHeaders;
