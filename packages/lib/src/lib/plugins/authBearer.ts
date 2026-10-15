// @ts-self-types="./authBearer.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosPlugin, InternalFaxiosRequestConfig } from "../../index.js";
import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import resolveRequestURL from "../core/resolveRequestURL.js";
import { definePlugin } from "./definePlugin.js";
import { assertOptions, isBoolean, isHeaderName, own } from "./shared.js";

/** What `authBearer` provides to plugins installed after it. */
export type AuthBearerCapability = { auth: { getToken: () => Promise<string>; }; };

export type AuthBearerOptions = {
  /** The header to set. Default `"Authorization"`. */
  header?: string;
  /**
   * The origins (`"https://api.example.com"`) that get the token, replacing the default rule:
   * with an absolute instance `baseURL`, only its origin; otherwise only relative request URLs.
   */
  origins?: Array<string>;
  /** Replace a header the request already has. Default `false`: an explicit header is kept. */
  overwrite?: boolean;
  /** Put before the token, separated by a space. Default `"Bearer"`; `""` sends the bare token. */
  scheme?: string;
};

// A bare origin, optionally with a trailing slash. A path would look like a narrower limit than
// the origin the token is really sent to.
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

const optionsSchema = {
  overwrite: isBoolean,
  scheme: (value: unknown) => (typeof value === "string" && !/[\r\n]/.test(value)) || "a string without line breaks",
  header: isHeaderName,
  origins: (value: unknown) => (Array.isArray(value) && value.every(o => originOf(o) !== null)) || "an array of origins such as \"https://api.example.com\"",
};

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

function sendsTokenTo(config: InternalFaxiosRequestConfig, instanceBaseURL: unknown, origins: null | ReadonlyArray<string>): boolean {
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
  let url: string;
  try {
    const resolved: unknown = resolveRequestURL({ ...config, pathParams: undefined, params: undefined });
    url = typeof resolved === "string" ? resolved : "";
  }
  catch {
    return false;
  }
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

/**
 * Sets `Authorization: Bearer <token>` on requests to the API it guards, asking `getToken` each
 * time, and provides the `auth` capability so later plugins (for example a token-refresh plugin)
 * can ask for a token too. A header the request already has is kept unless `overwrite` is set.
 * The token goes only to the instance `baseURL` origin when that is absolute, otherwise only to
 * relative request URLs; a per-request `baseURL` doesn't widen the rule. `origins` replaces it.
 *
 * With a custom `header`, `fetchOptions.redirect` defaults to `"error"` unless the request sets
 * it: fetch strips only `Authorization` when a redirect leaves the origin, so following one would
 * send the custom header to whatever host the API redirects to.
 *
 * When `getToken` gives anything other than a non-empty string (`null`, `undefined`, `""`, a
 * number, an object), the request is sent without the header, so a signed-out state never sends
 * `Bearer null`. The parameter type stays `string`: the guard is for JavaScript callers and casts.
 */
export function authBearer(getToken: () => Promise<string> | string, options: AuthBearerOptions = {}): FaxiosPlugin<{ provides: AuthBearerCapability; }> {
  if (typeof getToken !== "function") {
    throw new FaxiosError("authBearer: getToken must be a function", FaxiosError.ERR_BAD_OPTION_VALUE);
  }
  assertOptions(options, optionsSchema, "authBearer");
  const overwrite = own(options, "overwrite") ?? false;
  const scheme = own(options, "scheme") ?? "Bearer";
  const header = own(options, "header") ?? "Authorization";
  const customHeader = header.toLowerCase() !== "authorization";
  const origins = own(options, "origins")?.map(o => originOf(o)!) ?? null;
  const auth = { getToken: async () => getToken() };
  return definePlugin({
    name: "authBearer",
    provides: { auth },
    middleware: async (ctx, next) => {
      if ((!overwrite && ctx.config.headers.has(header)) || !sendsTokenTo(ctx.config, own(ctx, "instanceBaseURL"), origins)) return next(ctx);
      const token: unknown = await auth.getToken();
      if (typeof token !== "string" || token === "") return next(ctx);
      // On a copy: middleware that calls next() again (retry installed before this plugin) comes
      // back through here without the header, so every try asks for a fresh token.
      const headers = new FaxiosHeaders(ctx.config.headers).set(header, scheme ? `${scheme} ${token}` : token, true);
      // Null prototype, like every ctx.config: later middleware must not read inherited keys.
      const config: InternalFaxiosRequestConfig = Object.assign(Object.create(null) as InternalFaxiosRequestConfig, ctx.config);
      config.headers = headers;
      const fetchOptions = own(config, "fetchOptions");
      if (customHeader && (!fetchOptions || !Object.hasOwn(fetchOptions, "redirect"))) {
        config.fetchOptions = { ...fetchOptions, redirect: "error" };
      }
      return next({ ...ctx, config });
    },
  });
}
