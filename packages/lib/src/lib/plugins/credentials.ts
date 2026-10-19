// What `authenticate`, `authBearer` and `refreshAuth` share: which requests go to the API they
// guard, and how credentials are put on a request. Not an entry point.

import type { FaxiosContext, InternalFaxiosRequestConfig } from "../../index.js";
import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import { own, templateURL } from "./shared.js";
import type { OptionCheck } from "./shared.js";

// A bare origin, optionally with a trailing slash. A path would look like a narrower limit than
// the origin the credentials are really sent to.
function originOf(value: unknown): null | string {
  if (typeof value !== "string") return null;
  try {
    const { origin } = new URL(value);
    return origin !== "null" && (value === origin || value === `${origin}/`) ? origin : null;
  }
  catch {
    return null;
  }
}

/** The `origins` option check. */
export const isOriginList: OptionCheck = value =>
  (Array.isArray(value) && value.every(o => originOf(o) !== null)) || "an array of origins such as \"https://api.example.com\"";

/** A validated `origins` option as bare origins, or `null` when it is unset. */
export const originsOption = (origins: ReadonlyArray<string> | undefined): null | ReadonlyArray<string> =>
  origins?.map(o => originOf(o)!) ?? null;

// Resolves a relative URL the way a page would, without ever matching a real origin, so a URL
// that leaves the page (`//host`, `/\host`) is told apart from one that stays on it.
const SAME_ORIGIN = "https://same-origin.invalid";

function resolvedOrigin(url: string, base: string | undefined): null | string {
  try {
    return new URL(url, base).origin;
  }
  catch {
    return null;
  }
}

// A relative URL goes to the page's origin, which only a browser has.
function pageHref(): string | undefined {
  // `location` is a browser global; the lib's types (no DOM lib) don't declare it.
  const location: unknown = Reflect.get(globalThis, "location");
  if (location && typeof location === "object" && "href" in location && typeof location.href === "string") return location.href;
  return undefined;
}

// The scheme and authority of a URL template (`https://api.example.com`, `{s}://host`,
// `//host`): an optional scheme up to a `:`, then two slashes and the authority. No match for a
// URL without an authority. Neither class matches a slash, so the scan is linear.
const SCHEME_AND_AUTHORITY = /^(?:[^/?#\\]*:)?[/\\]{2}[^/?#\\]*/;

/**
 * Whether a request goes to the API: with `origins`, one of them; otherwise the instance
 * `baseURL` origin when that is absolute, else only relative request URLs.
 */
export function goesToAPI(config: InternalFaxiosRequestConfig, instanceBaseURL: unknown, origins: null | ReadonlyArray<string>): boolean {
  // A placeholder in the scheme or authority (`{s}://evil.test`, `https://{host}/x`) lets the
  // path params, which may only exist after `pathParamsSchema` runs, decide the origin: no token.
  const template = own(config, "url");
  if (typeof template === "string" && SCHEME_AND_AUTHORITY.exec(template)?.[0].includes("{")) return false;
  // The URL core sends, from the same resolver, without `pathParams` and `params`: middleware runs
  // before `pathParamsSchema`, which may fill or rename placeholders, and the caller's
  // paramsSerializer shouldn't run an extra time. That is sound because core fills a placeholder
  // only with a non-empty run of non-delimiter characters (substitutePathParams rejects `""`
  // and encodes `: / \ ? # @`), just like the `{key}` left here: the template and the URL sent
  // have the same delimiters in the same places, so outside the scheme and authority checked
  // above a path param can't move the origin. A scheme placeholder without `//` (`{s}:/x`) can
  // only make an `http(s):` URL without `//`, which core rejects with ERR_INVALID_URL. The URL
  // parser drops tabs and line breaks (`{s}:\t//host`), so core rejects a url or baseURL holding
  // one (ERR_INVALID_URL) and the resolve below throws: the template checked here is the one sent.
  // A URL core rejects (an absolute URL with `allowAbsoluteUrls: false`) gets no token.
  const url = templateURL(config);
  if (url === undefined) return false;
  const page = pageHref();
  if (origins) {
    const origin = resolvedOrigin(url, page);
    return origin !== null && origins.includes(origin);
  }
  // The instance's baseURL, never a per-request one: that would hand the token to any host a
  // request names as its baseURL.
  const apiOrigin = typeof instanceBaseURL === "string" ? resolvedOrigin(instanceBaseURL, undefined) : null;
  if (apiOrigin !== null && apiOrigin !== "null") {
    return resolvedOrigin(url, page ?? SAME_ORIGIN) === apiOrigin;
  }
  // Only a relative URL that stays on the page: not one that parses alone, `//host` or `/\host`.
  return resolvedOrigin(url, undefined) === null && resolvedOrigin(url, SAME_ORIGIN) === SAME_ORIGIN;
}

// A browser drops a Cookie header a request sets (a forbidden request header), so credentials put
// there would never be sent. Server runtimes keep it. Asked once, on the first Cookie credential.
let cookieHeaderKept: boolean | undefined;
function keepsCookieHeader(): boolean {
  if (cookieHeaderKept === undefined) {
    const Request: unknown = Reflect.get(globalThis, "Request");
    try {
      cookieHeaderKept = typeof Request !== "function"
        || new (Request as new(url: string, init: object) => { headers: { has: (name: string) => boolean; }; })("http://localhost/", { headers: { cookie: "a=b" } }).headers.has("cookie");
    }
    catch {
      cookieHeaderKept = true;
    }
  }
  return cookieHeaderKept;
}

// A copy of `headers` with the credential headers set, how many it set, and the lower-cased names
// it set other than Authorization: fetch strips only Authorization when a redirect leaves the origin, so those
// would follow a redirect to whatever host it points at. On a copy, so middleware that calls
// next() again (retry installed before this plugin) comes back through here without the
// credentials, and every try asks for fresh ones.
function withHeaders(headers: InternalFaxiosRequestConfig["headers"], credentials: Array<[string, string]>, overwrite: boolean): { custom: Array<string>; headers: FaxiosHeaders; set: number; } {
  const sent = new FaxiosHeaders(headers);
  const custom: Array<string> = [];
  let set = 0;
  for (const [ name, value ] of credentials) {
    if (!overwrite && sent.has(name)) continue;
    sent.set(name, value, true);
    set++;
    if (name.toLowerCase() !== "authorization") custom.push(name.toLowerCase());
  }
  return { custom, headers: sent, set };
}

type SearchParams = { has: (name: string) => boolean; set: (name: string, value: string) => void; toString: () => string; };

const isSearchParams = (value: unknown): value is SearchParams =>
  Object.prototype.toString.call(value) === "[object URLSearchParams]";

// A copy of the request's params with the query credentials set, never the caller's object, and
// the names it set. A parameter the request already has is kept unless `overwrite`.
function withQuery(config: InternalFaxiosRequestConfig, query: Array<[string, string]>, overwrite: boolean): { names: Array<string>; params: InternalFaxiosRequestConfig["params"]; } {
  const params: unknown = own(config, "params");
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
  if (params !== undefined && params !== null && typeof params !== "object") {
    throw new FaxiosError("authenticate: query credentials need params to be an object or URLSearchParams", FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
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

/**
 * `ctx` with the credential `headers` and `query` parameters put on a copy of its config, or
 * `ctx` itself when it sets none. One the request already has is kept unless `overwrite`. Any
 * header but Authorization, and any query parameter, makes the request refuse redirects unless
 * it sets `redirect`, and is added to its `redact` list. Throws `ERR_BAD_OPTION_VALUE` for a
 * Cookie header in a browser, which would drop it unsent, and for query credentials on params
 * that aren't an object or URLSearchParams.
 */
export function putCredentials<TOptions, TCapabilities>(ctx: FaxiosContext<TOptions, TCapabilities>, headers: Array<[string, string]>, overwrite: boolean, query: Array<[string, string]> = []): FaxiosContext<TOptions, TCapabilities> {
  const config = ctx.config;
  const put = withHeaders(config.headers, headers, overwrite);
  // From `cookies` or set as a header (`authBearer` with `header: "Cookie"`), alike. A Cookie the
  // request already has, and so keeps, isn't one the credentials would lose.
  if (put.custom.includes("cookie") && !keepsCookieHeader()) {
    throw new FaxiosError("A browser doesn't let a request set the Cookie header; it sends its own cookies (see withCredentials)", FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
  const placed = query.length > 0 ? withQuery(config, query, overwrite) : undefined;
  const queryNames = placed?.names ?? [];
  if (put.set === 0 && queryNames.length === 0) return ctx;
  // Null prototype, like every ctx.config: later middleware must not read inherited keys.
  const next = Object.assign(Object.create(null) as typeof config, config);
  next.headers = put.headers;
  if (placed) next.params = placed.params;
  // Every credential but Authorization: fetch sends other headers on to whatever host a redirect
  // points at, and forwardTo copies the full URL, query string and all, into a header.
  const redact = [ ...put.custom, ...queryNames ];
  const fetchOptions = own(next, "fetchOptions");
  if (redact.length > 0 && (!fetchOptions || !Object.hasOwn(fetchOptions, "redirect") || fetchOptions.redirect === undefined)) {
    next.fetchOptions = { ...fetchOptions, redirect: "error" };
  }
  // Mask the credentials in error.toJSON() (which matches names lower-cased), as the default
  // list masks Authorization and Cookie.
  if (redact.length > 0) next.redact = [ ...own(next, "redact") ?? [], ...redact ];
  return { ...ctx, config: next };
}
