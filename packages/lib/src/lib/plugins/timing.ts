// @ts-self-types="./timing.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import buildFullPath from "../core/buildFullPath.js";
import type { FaxiosContext, FaxiosPlugin } from "../types.js";
import utils from "../utils.js";
import { RETRY_ATTEMPT } from "./attempt.js";
import { definePlugin } from "./definePlugin.js";

/**
 * What `timing` reports once per request: `status` on success, `error` on failure. No config,
 * headers, body or URL credentials, so an event is safe to log.
 */
export type TimingEvent = {
  /**
   * The try number from `retry`: each try's when installed after it, the final try's when
   * installed before it. Absent without `retry`.
   */
  attempt?: number;
  durationMs: number;
  /** The request method, upper-cased (`"GET"`). */
  method: string;
  /** The full request URL without its user info, query string and fragment. */
  url: string;
} & ({ error: TimingError; status?: undefined; } | { error?: undefined; status: number; });

/**
 * The failure `timing` reports: the error's `code` (a `FaxiosError` code such as
 * `"ERR_NETWORK"`), `message`, and the HTTP `status` when a response arrived.
 */
type TimingError = { code: string | undefined; message: string; status: number | undefined; };

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

const own = <T extends object, K extends keyof T>(source: T, key: K): T[K] | undefined =>
  (utils.hasOwnProp(source, key) ? source[key] : undefined);

// Up to the `@` of a URL's user info: after the scheme (`http:`, with any slashes) or after `//`.
// Backslashes count as slashes, as they do in the WHATWG URL parser.
const USER_INFO = /^([a-z][a-z\d+\-.]*:[/\\]*|[/\\]{2})[^/\\?#]*@/i;

// Read once the request settles, so a later middleware's changes to the config count. The user
// info, query and fragment often carry secrets, and they'd make every URL a different metric label.
function describe({ config, state }: FaxiosContext) {
  // Typed string, but undefined when the request has neither url nor baseURL.
  const full: unknown = buildFullPath(own(config, "baseURL"), own(config, "url"), own(config, "allowAbsoluteUrls"));
  const url = typeof full === "string" ? full : "";
  const end = url.search(/[?#]/);
  const attempt = state[RETRY_ATTEMPT];
  return {
    method: String(own(config, "method") ?? "get").toUpperCase(),
    url: (end === -1 ? url : url.slice(0, end)).replace(USER_INFO, "$1"),
    ...(typeof attempt === "number" ? { attempt } : {}),
  };
}

// Only the code, message and status: a FaxiosError carries the config, so its headers too.
function summarize(error: unknown): TimingError {
  const code = utils.getSafeProp(error, "code");
  const status = utils.getSafeProp(error, "status");
  return {
    code: typeof code === "string" ? code : undefined,
    message: error instanceof Error ? error.message : String(error),
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
