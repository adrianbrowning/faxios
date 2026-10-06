// @ts-self-types="./timing.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import buildFullPath from "../core/buildFullPath.js";
import type { FaxiosContext, FaxiosPlugin } from "../types.js";
import utils from "../utils.js";
import { RETRY_ATTEMPT } from "./attempt.js";
import { definePlugin } from "./definePlugin.js";

/**
 * What `timing` reports once per request: `status` on success, `error` on failure. No config,
 * headers or body, so an event is safe to log.
 */
export type TimingEvent = {
  /** The request method, upper-cased (`"GET"`). */
  method: string;
  /** The full request URL without its query string and fragment. */
  url: string;
  /**
   * The try number from `retry`: each try's when installed after it, the final try's when
   * installed before it. Absent without `retry`.
   */
  attempt?: number;
  durationMs: number;
} & ({ status: number; error?: undefined; } | { status?: undefined; error: unknown; });

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

const own = <T extends object, K extends keyof T>(source: T, key: K): T[K] | undefined =>
  (utils.hasOwnProp(source, key) ? source[key] : undefined);

// Read once the request settles, so a later middleware's changes to the config count. The query
// and fragment often carry secrets, and they'd make every URL a different metric label.
function describe({ config, state }: FaxiosContext) {
  // Typed string, but undefined when the request has neither url nor baseURL.
  const full: unknown = buildFullPath(own(config, "baseURL"), own(config, "url"), own(config, "allowAbsoluteUrls"));
  const url = typeof full === "string" ? full : "";
  const end = url.search(/[?#]/);
  const attempt = state[RETRY_ATTEMPT];
  return {
    method: String(own(config, "method") ?? "get").toUpperCase(),
    url: end === -1 ? url : url.slice(0, end),
    ...(typeof attempt === "number" ? { attempt } : {}),
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
          onTiming({ ...describe(ctx), durationMs: now() - start, error });
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
