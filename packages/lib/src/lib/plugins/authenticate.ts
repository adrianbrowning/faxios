// @ts-self-types="./authenticate.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosContext, FaxiosPlugin, InternalFaxiosRequestConfig, StandardSchemaV1 } from "../../index.js";
import FaxiosError from "../core/FaxiosError.js";
import { goesToAPI, isOriginList, originsOption, putCredentials } from "./credentials.js";
import type { MoreCredentials } from "./credentials.js";
import { definePlugin } from "./definePlugin.js";
import { assertOptions, isBoolean, own, TOKEN } from "./shared.js";
import type { OptionCheck } from "./shared.js";

// `x?: T | undefined` lets a consumer with `exactOptionalPropertyTypes` pass the `undefined` the
// option checks treat as unset.
/* eslint-disable sonarjs/no-redundant-optional -- see above */
/**
 * Name to value. A value other than a non-empty string (`null`, `undefined`, `""`) sends nothing.
 * An interface-typed store has no index signature, so pass a copy: `{ ...store }`.
 */
export type AuthenticateCredentialValues = Readonly<Record<string, null | string | undefined>>;

/** Where `authenticate` puts credentials on a request. */
export type AuthenticateCredentials = {
  /** Sent in one `Cookie` header. Server runtimes only: a browser doesn't let a request set it. */
  cookies?: AuthenticateCredentialValues | undefined;
  /** Header name to the whole header value, such as `{ Authorization: "Bearer abc" }`. */
  headers?: AuthenticateCredentialValues | undefined;
  /**
   * Query string parameters, added to the request's `params`. With a `paramsSchema`, they are
   * added to its output: the schema sees only the request's own params.
   */
  query?: AuthenticateCredentialValues | undefined;
};

export type AuthenticateOptions = {
  /**
   * The origins (`"https://api.example.com"`) that get the credentials, replacing the default
   * rule: with an absolute instance `baseURL`, only its origin; otherwise only relative request URLs.
   */
  origins?: ReadonlyArray<string> | undefined;
  /** Replace a header or query parameter the request already has. Default `false`: it is kept. */
  overwrite?: boolean | undefined;
};
/* eslint-enable sonarjs/no-redundant-optional */

const optionsSchema = { overwrite: isBoolean, origins: isOriginList };

const isValues: OptionCheck = value => (value !== null && typeof value === "object" && !Array.isArray(value)) || "an object";
const credentialsSchema = { cookies: isValues, headers: isValues, query: isValues };

// cookie-octet (RFC 6265 §4.1.1): no whitespace, DQUOTE, comma, semicolon or backslash, so a
// value can't add a cookie of its own.
const COOKIE_VALUE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;

// The own entries with a non-empty string value, in order; any other value sends nothing, so a
// signed-out store never sends `null`. A name `valid` refuses rejects, as does a cookie value
// that would add cookies of its own.
function entriesOf(values: AuthenticateCredentialValues | undefined, place: string, valid: RegExp, config: InternalFaxiosRequestConfig): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [ name, value ] of Object.entries(values ?? {})) {
    if (!valid.test(name)) throw new FaxiosError(`authenticate: ${JSON.stringify(name)} is not a valid ${place} name`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
    if (typeof value !== "string" || value === "") continue;
    if (place === "cookie" && !COOKIE_VALUE.test(value)) {
      throw new FaxiosError(`authenticate: cookie ${name} has a character a cookie value can't hold`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
    }
    out.push([ name, value ]);
  }
  return out;
}

type SearchParams = { has: (name: string) => boolean; set: (name: string, value: string) => void; toString: () => string; };

const isSearchParams = (value: unknown): value is SearchParams =>
  Object.prototype.toString.call(value) === "[object URLSearchParams]";

// A copy of `params` with the query credentials set, never the caller's object, and the names it
// set; `null` when `params` isn't an object or URLSearchParams, or is an array. A parameter the
// request already has is kept unless `overwrite`.
function withQuery(params: unknown, query: Array<[string, string]>, overwrite: boolean): null | { names: Array<string>; params: NonNullable<InternalFaxiosRequestConfig["params"]>; } {
  const names: Array<string> = [];
  if (isSearchParams(params)) {
    const copy = new URLSearchParams(params.toString()) as unknown as SearchParams;
    for (const [ name, value ] of query) {
      if (!overwrite && copy.has(name)) continue;
      copy.set(name, value);
      names.push(name);
    }
    return { names, params: copy };
  }
  if (Array.isArray(params) || (params !== undefined && params !== null && typeof params !== "object")) return null;
  // Null prototype, like ctx.config: own entries only, and `__proto__` stays a plain key.
  const copy: Record<string, unknown> = Object.create(null);
  for (const [ name, value ] of Object.entries(params ?? {})) copy[name] = value;
  for (const [ name, value ] of query) {
    if (!overwrite && Object.hasOwn(copy, name)) continue;
    copy[name] = value;
    names.push(name);
  }
  return { names, params: copy };
}

// `schema` with the query credentials added to its output. Core runs paramsSchema after
// middleware and sends its output, so a schema that strips unknown keys would drop credentials put
// in params, and a strict one would reject them. The schema sees only the request's own params.
// Output core rejects (not an object or URLSearchParams, an array, or a result with `issues`) is
// passed on as is, for core to report.
function withQueryAfter(schema: StandardSchemaV1, query: Array<[string, string]>, overwrite: boolean): StandardSchemaV1 {
  const standard = schema["~standard"];
  const add = (result: StandardSchemaV1.Result<unknown>): StandardSchemaV1.Result<unknown> => {
    // A malformed result goes to core as is, which reports it as ERR_BAD_PARAMS_SCHEMA. Core
    // fails any result whose `issues` isn't undefined, `null` and `false` too.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- third-party schema
    if (!result || typeof result !== "object" || result.issues !== undefined) return result;
    const placed = withQuery(result.value, query, overwrite);
    return placed ? { value: placed.params } : result;
  };
  // Core awaits every result, so a sync schema can be made async here.
  return { "~standard": { ...standard, validate: async (value: unknown) => add(await standard.validate(value)) } };
}

// What `putCredentials` must change to send `query`: the params, or with a paramsSchema, its
// output. `undefined` when it sets nothing. Throws `ERR_BAD_OPTION_VALUE` for params that aren't
// an object or URLSearchParams.
function queryChanges(config: InternalFaxiosRequestConfig, query: Array<[string, string]>, overwrite: boolean): MoreCredentials | undefined {
  if (query.length === 0) return undefined;
  const schema = own(config, "paramsSchema");
  // With a paramsSchema, which names end up set is known only after it runs: mask them all.
  if (schema) return { paramsSchema: withQueryAfter(schema, query, overwrite), redact: query.map(([ name ]) => name) };
  const placed = withQuery(own(config, "params"), query, overwrite);
  if (!placed) throw new FaxiosError("authenticate: query credentials need params to be an object or URLSearchParams", FaxiosError.ERR_BAD_OPTION_VALUE, config);
  return placed.names.length > 0 ? { params: placed.params, redact: placed.names } : undefined;
}

// `ctx` with `credentials` on a copy of its config, or `ctx` itself when there is nothing to send.
// Throws a `FaxiosError` for credentials that can't be sent as given: not an object, an unknown
// place, a bad name or cookie value, or a cookie in a browser.
function withCredentials<TOptions, TCapabilities>(ctx: FaxiosContext<TOptions, TCapabilities>, credentials: unknown, overwrite: boolean): FaxiosContext<TOptions, TCapabilities> {
  if (credentials === null || credentials === undefined) return ctx;
  const config = ctx.config;
  if (typeof credentials !== "object") {
    throw new FaxiosError("authenticate: getCredentials must give an object, null or undefined", FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
  assertOptions(credentials, credentialsSchema, "authenticate", config);
  const given = credentials as AuthenticateCredentials;
  const headers = entriesOf(own(given, "headers"), "header", TOKEN, config);
  const query = entriesOf(own(given, "query"), "query", /./, config);
  const cookies = entriesOf(own(given, "cookies"), "cookie", TOKEN, config);
  if (cookies.length > 0) headers.push([ "Cookie", cookies.map(([ name, value ]) => `${name}=${value}`).join("; ") ]);
  return putCredentials(ctx, headers, overwrite, queryChanges(config, query, overwrite));
}

/**
 * Puts the credentials `getCredentials` gives on requests to the API it guards, asking for them
 * on each request (and each try, when `retry` is installed before it): `headers` as headers,
 * `query` as query string parameters, `cookies` in one `Cookie` header (server runtimes only;
 * a browser rejects with `ERR_BAD_OPTION_VALUE`, since it drops that header). A value other than
 * a non-empty string sends nothing, so a signed-out store sends no credentials.
 *
 * The credentials go only to the instance `baseURL` origin when that is absolute, otherwise only
 * to relative request URLs; a per-request `baseURL` doesn't widen the rule. `origins` replaces it.
 * A header or query parameter the request already has is kept unless `overwrite` is set. Any
 * header but `Authorization`, any cookie, and any query parameter sets `fetchOptions.redirect` to
 * `"error"` unless the request sets it: fetch sends headers other than Authorization on to
 * whatever host a redirect points at, and `forwardTo` copies the full URL into a header. The name
 * of each of those the plugin sets (not one the request keeps) is added to the request's `redact`
 * list; `Cookie` and `Authorization` are masked by default. Query credentials go into `params`;
 * with a `paramsSchema`, into its output, so the schema neither strips nor rejects them.
 */
export function authenticate(
  getCredentials: () => AuthenticateCredentials | null | Promise<AuthenticateCredentials | null | undefined> | undefined,
  options: AuthenticateOptions = {}
): FaxiosPlugin {
  if (typeof getCredentials !== "function") {
    throw new FaxiosError("authenticate: getCredentials must be a function", FaxiosError.ERR_BAD_OPTION_VALUE);
  }
  assertOptions(options, optionsSchema, "authenticate");
  const overwrite = own(options, "overwrite") ?? false;
  const origins = originsOption(own(options, "origins"));
  return definePlugin({
    name: "authenticate",
    middleware: async (ctx, next) => {
      if (!goesToAPI(ctx.config, own(ctx, "instanceBaseURL"), origins)) return next(ctx);
      return next(withCredentials(ctx, await getCredentials(), overwrite));
    },
  });
}
