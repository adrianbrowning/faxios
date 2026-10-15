// @ts-self-types="./timing.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosContext, FaxiosPlugin } from "../../index.js";
import { definePlugin } from "./definePlugin.js";
import { own, templateURL } from "./shared.js";

/**
 * What `timing` reports once per request: `status` on success, `error` on failure. No config,
 * headers, body or URL credentials: the URL loses its user info, query and fragment, and the
 * error message its URL user info. The rest of an error message is the error's own text, so a
 * middleware or schema that puts a secret in its message puts it in the event too.
 */
export type TimingEvent = {
  /**
   * The try number, `ctx.attempt`: 1 without `retry`. Installed after `retry`, each try's;
   * installed before it, the last try's.
   */
  attempt: number;
  durationMs: number;
  /** The request method, upper-cased (`"GET"`). */
  method: string;
  /**
   * The full request URL without its user info, query string and fragment. Path params stay as
   * their template (`/users/{id}`). A URL core rejects (an absolute URL with
   * `allowAbsoluteUrls: false`) is reported as the request gave it.
   */
  url: string;
} & ({ error: TimingError; status?: undefined; } | { error?: undefined; status: number; });

/**
 * The failure `timing` reports: the error's `code` (a `FaxiosError` code such as
 * `"ERR_NETWORK"`), `message` without URL user info, and the HTTP `status` when a response arrived.
 */
type TimingError = { code: string | undefined; message: string; status: number | undefined; };

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

// Up to the `@` of a URL's user info: after the scheme (`http:`, with any slashes) or after `//`.
// Backslashes count as slashes, as they do in the WHATWG URL parser.
const USER_INFO = /^([a-z][a-z\d+\-.]*:[/\\]*|[/\\]{2})[^/\\?#]*@/i;

// `user:pass@` after a `scheme://` anywhere in an error message. A match starts only at a scheme
// character followed by `:` and two slashes, and stops at the first `/`, so the scan is linear.
// The user info runs through the last `@` before a `/`, `?`, `#` or space (`user:p@ss@host`).
const USER_INFO_IN_TEXT = /([a-z\d+\-.]:[/\\]{2})(?:[^/\\?#\s@]*@)+/gi;

// A property the error or its class defines, never one only Object.prototype supplies.
function errorProp(error: unknown, key: "code" | "status"): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  for (let o: null | object = error; o !== null && o !== Object.prototype; o = Object.getPrototypeOf(o) as null | object) {
    if (Object.hasOwn(o, key)) return Reflect.get(error, key);
  }
  return undefined;
}

// Read once the request settles, so a later middleware's changes to the config count. The user
// info, query and fragment often carry secrets, and they'd make every URL a different metric label.
// Resolved by core's resolver, without path params (the template keeps labels low-cardinality) or
// `params` (stripped anyway; the caller's paramsSerializer isn't run again).
function describe({ attempt, config }: FaxiosContext) {
  const resolved = templateURL(config) ?? own(config, "url");
  const url = typeof resolved === "string" ? resolved : "";
  const end = url.search(/[?#]/);
  return {
    method: String(own(config, "method") ?? "get").toUpperCase(),
    url: (end === -1 ? url : url.slice(0, end)).replace(USER_INFO, "$1"),
    attempt,
  };
}

// Only the code, message and status: a FaxiosError carries the config, so its headers too.
function summarize(error: unknown): TimingError {
  const code = errorProp(error, "code");
  const status = errorProp(error, "status");
  return {
    code: typeof code === "string" ? code : undefined,
    message: (error instanceof Error ? error.message : String(error)).replace(USER_INFO_IN_TEXT, "$1"),
    status: typeof status === "number" ? status : undefined,
  };
}

/**
 * Measures the time around `next` and calls `onTiming` once per request with the method, URL,
 * duration and status or error. Installed before `retry`, the duration covers every try;
 * installed after it, each try is reported. The response is returned unchanged. If `onTiming`
 * throws while reporting a failure, the request still rejects with its own error; while
 * reporting a success, its error rejects the request.
 */
export function timing(onTiming: (event: TimingEvent) => void): FaxiosPlugin {
  return definePlugin({
    name: "timing",
    middleware: async (ctx, next) => {
      const start = now();
      let response;
      try {
        response = await next(ctx);
      }
      catch (error) {
        try {
          onTiming({ ...describe(ctx), durationMs: now() - start, error: summarize(error) });
        }
        catch {
          // The request's own error matters more than the observer's; keep it.
        }
        throw error;
      }
      // Outside the try, so an onTiming that throws isn't reported as a failed request.
      onTiming({ ...describe(ctx), durationMs: now() - start, status: response.status });
      return response;
    },
  });
}
