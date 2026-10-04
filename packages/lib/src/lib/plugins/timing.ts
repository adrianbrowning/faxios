// @ts-self-types="./timing.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosPlugin, InternalFaxiosRequestConfig } from "../types.js";

/** What `timing` reports once per request: `status` on success, `error` on failure. */
export type TimingEvent =
  | { config: InternalFaxiosRequestConfig; durationMs: number; status: number; error?: undefined; }
  | { config: InternalFaxiosRequestConfig; durationMs: number; status?: undefined; error: unknown; };

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

/**
 * Measures the time around `next` and calls `onTiming` once per request. Installed before
 * `retry`, the duration covers every try; installed after it, each try is reported. The
 * response is returned unchanged.
 */
export default function timing(onTiming: (event: TimingEvent) => void): FaxiosPlugin {
  return {
    name: "timing",
    middleware: async (ctx, next) => {
      const start = now();
      let response;
      try {
        response = await next(ctx);
      }
      catch (error) {
        onTiming({ config: ctx.config, durationMs: now() - start, error });
        throw error;
      }
      // Outside the try, so an onTiming that throws isn't reported as a failed request.
      onTiming({ config: ctx.config, durationMs: now() - start, status: response.status });
      return response;
    },
  };
}
