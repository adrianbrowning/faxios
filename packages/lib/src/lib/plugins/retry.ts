// @ts-self-types="./retry.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import CanceledError from "../cancel/CanceledError.js";
import isCancel from "../cancel/isCancel.js";
import FaxiosError from "../core/FaxiosError.js";
import type { FaxiosPlugin, FaxiosRequestConfig, GenericAbortSignal } from "../types.js";
import utils from "../utils.js";

// Config values are read as own properties only (repo rule for possibly untrusted input).
function ownValue<T extends object, K extends keyof T>(source: T, key: K): T[K] | undefined {
  return Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
}

export type RetryOptions = {
  /** Total tries, counting the first request. Default 3. */
  attempts?: number;
  /**
   * Whether the try that just failed should be retried. `attempt` counts from 1.
   * Default: network errors, timeouts and 5xx responses; never a cancellation.
   */
  retryOn?: (error: unknown, attempt: number) => boolean;
  /** Milliseconds to wait before the next try, or a function of the try that failed. Default 100ms, doubling. */
  delay?: number | ((attempt: number, error: unknown) => number);
};

/** Per-request override: `false` turns retries off, an object overrides the plugin's options. */
export type RetryRequestOptions = { retry?: RetryOptions | false; };

function retryByDefault(error: unknown): boolean {
  if (isCancel(error) || !(error instanceof FaxiosError)) return false;
  if (error.code === FaxiosError.ERR_NETWORK || error.code === FaxiosError.ETIMEDOUT) return true;
  const status = error.response?.status;
  return status !== undefined && status >= 500;
}

const doublingDelay = (attempt: number) => 100 * 2 ** (attempt - 1);

// A stream is consumed by the first try, so sending it again would send nothing.
// The same stream checks the fetch adapter uses: web ReadableStreams and Node-style pipe streams.
function canReplay(data: unknown): boolean {
  return !utils.isReadableStream?.(data) && !utils.isStream(data);
}

function wait(ms: number, signal: AbortSignal | GenericAbortSignal | undefined, config: FaxiosRequestConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CanceledError(null, config));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CanceledError(null, config));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort);
  });
}

/**
 * Retries failed requests by calling `next` again. Each `next` dispatches its own copy of the
 * config, so every try starts from the same input. Install it inside middleware that should run
 * once per request (for example `timing` installed first measures all tries together).
 */
export default function retry(options: RetryOptions = {}): FaxiosPlugin<unknown, unknown, RetryRequestOptions> {
  return {
    name: "retry",
    middleware: async (ctx, next) => {
      const perRequest = ownValue(ctx.config, "retry");
      if (perRequest === false) return next(ctx);
      // Per field, request first: no merged object, and only own properties count.
      const setting = <K extends keyof RetryOptions>(key: K) => (perRequest ? ownValue(perRequest, key) : undefined) ?? ownValue(options, key);
      const attempts = setting("attempts") ?? 3;
      const retryOn = setting("retryOn") ?? retryByDefault;
      const delay = setting("delay") ?? doublingDelay;

      // Tries run one after another on purpose: each must finish before deciding on the next.
      for (let attempt = 1; ; attempt++) {
        try {
          // eslint-disable-next-line no-await-in-loop -- see above
          return await next(ctx);
        }
        catch (error) {
          if (attempt >= attempts || !canReplay(ownValue(ctx.config, "data")) || !retryOn(error, attempt)) throw error;
          // eslint-disable-next-line no-await-in-loop -- see above
          await wait(typeof delay === "function" ? delay(attempt, error) : delay, ownValue(ctx.config, "signal"), ctx.config);
        }
      }
    },
  };
}
