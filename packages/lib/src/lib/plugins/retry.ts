// @ts-self-types="./retry.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import CanceledError from "../cancel/CanceledError.js";
import isCancel from "../cancel/isCancel.js";
import FaxiosError from "../core/FaxiosError.js";
import validator from "../helpers/validator.js";
import type { FaxiosContext, FaxiosPlugin, FaxiosRequestConfig, GenericAbortSignal, InternalFaxiosRequestConfig, Method } from "../types.js";
import utils from "../utils.js";
import { RETRY_ATTEMPT } from "./attempt.js";
import { definePlugin } from "./definePlugin.js";

// Config values are read as own properties only (repo rule for possibly untrusted input).
const ownValue = <T extends object, K extends keyof T>(source: T, key: K): T[K] | undefined =>
  (utils.hasOwnProp(source, key) ? source[key] : undefined);

const isWait = (ms: unknown): ms is number => typeof ms === "number" && Number.isFinite(ms) && ms >= 0;

// An HTTP method is a token (RFC 9110 §9.1, §5.6.2); anything else can never match a request.
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const isStatus = (value: unknown) => Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599;

// Bounded on purpose: NaN or Infinity would make a failing request loop forever.
const optionsSchema = {
  attempts: (value: unknown) => (Number.isInteger(value) && (value as number) >= 1) || "an integer of at least 1",
  retryOn: validator.validators["function"],
  delay: (value: unknown) => isWait(value) || typeof value === "function" || "a finite number of at least 0 or a function",
  methods: (value: unknown) => (Array.isArray(value) && value.every(m => typeof m === "string" && TOKEN.test(m))) || "an array of HTTP method names",
  statuses: (value: unknown) => (Array.isArray(value) && value.every(isStatus)) || "an array of HTTP status codes (100-599)",
  maxRetryAfter: (value: unknown) => isWait(value) || "a finite number of milliseconds of at least 0",
  maxDelay: (value: unknown) => isWait(value) || "a finite number of milliseconds of at least 0",
  jitter: (value: unknown) => value === "full" || value === "none" || "\"full\" or \"none\"",
  respectRetryAfter: validator.validators["boolean"],
  onRetry: validator.validators["function"],
};

// Transient failures: timeout, rate limit, and server errors that may clear on their own. 501 and
// 505 mean the server will never handle the request, so they aren't here.
const DEFAULT_STATUSES: ReadonlyArray<number> = [ 408, 429, 500, 502, 503, 504 ];

// Statuses whose Retry-After says when to try again (RFC 9110 §10.2.3).
const RETRY_AFTER_STATUSES: ReadonlyArray<number> = [ 429, 503 ];

// Methods whose repeat has the same effect as one request (RFC 9110 §9.2.2, plus QUERY).
const IDEMPOTENT_METHODS: ReadonlyArray<string> = [ "get", "head", "options", "put", "delete", "query" ];

// One check for both the factory argument and a per-request override.
function assertRetryOptions(value: unknown, config?: InternalFaxiosRequestConfig): asserts value is RetryOptions {
  if (value === null || typeof value !== "object") {
    throw new FaxiosError("retry options must be an object", FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
  validator.assertOptions(value, optionsSchema, false);
}

export type RetryOptions = {
  /** Total tries, counting the first request. Default 3. */
  attempts?: number;
  /**
   * Whether the try that just failed should be retried. `attempt` counts from 1.
   * Default: network errors, timeouts and the `statuses`; never a cancellation. A custom `retryOn`
   * replaces that whole predicate, so `statuses` is ignored when both are set. retryOn decides
   * only within `methods`; to retry POST, list it in `methods`.
   */
  retryOn?: (error: unknown, attempt: number) => boolean;
  /**
   * Response statuses the default predicate retries. Default 408, 429, 500, 502, 503 and 504.
   * Ignored when `retryOn` is set.
   */
  statuses?: ReadonlyArray<number>;
  /**
   * Milliseconds to wait before the next try, or a function of the try that failed. Default 100ms,
   * doubling. Capped at `maxDelay`, then jittered. A 429 or 503 with a `Retry-After` header waits
   * that long instead, unless `respectRetryAfter` is `false`.
   */
  delay?: number | ((attempt: number, error: unknown) => number);
  /** The most the computed backoff waits, in milliseconds. Default 30 000. Doesn't apply to `Retry-After`. */
  maxDelay?: number;
  /**
   * `"full"` (default) waits a random time between 0 and the capped backoff, so clients that failed
   * together don't retry together; `"none"` waits the capped backoff. Doesn't apply to `Retry-After`.
   */
  jitter?: "full" | "none";
  /**
   * The longest `Retry-After` (seconds or an HTTP date, on a 429 or 503) to wait, in milliseconds.
   * Default 300 000 (5 minutes). A longer one rejects with the response's error instead of retrying.
   * Ignored when `respectRetryAfter` is `false`.
   */
  maxRetryAfter?: number;
  /**
   * Whether a 429 or 503's `Retry-After` header sets the wait. Default `true`. With `false`, every
   * retry waits the computed backoff and `maxRetryAfter` doesn't apply; which requests retry doesn't
   * change. Turn it off when another plugin, such as a queue throttle, honours `Retry-After` itself.
   */
  respectRetryAfter?: boolean;
  /**
   * Called before each wait with the error, the try that failed and the wait in milliseconds. If it
   * throws, the request rejects with that error and stops retrying.
   */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /**
   * HTTP methods that may be retried, in any case. Default: GET, HEAD, OPTIONS, PUT, DELETE and
   * QUERY. POST and PATCH aren't idempotent, so add them only if your API dedupes repeats. A request
   * whose method isn't listed is never retried, whatever `retryOn` or `statuses` say.
   */
  methods?: ReadonlyArray<Method>;
};

/** Per-request override: `false` turns retries off, an object overrides the plugin's options. */
export type RetryRequestOptions = { retry?: RetryOptions | false; };

function retryByDefault(error: unknown, statuses: ReadonlyArray<number>): boolean {
  if (isCancel(error) || !(error instanceof FaxiosError)) return false;
  if (error.code === FaxiosError.ERR_NETWORK || error.code === FaxiosError.ETIMEDOUT) return true;
  const status = error.response?.status;
  return status !== undefined && statuses.includes(status);
}

// The wait a 429 or 503 asks for, in milliseconds: delay-seconds or an HTTP date (a past date
// means now). undefined when there's no usable header, so the computed backoff applies.
function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof FaxiosError) || !error.response || !RETRY_AFTER_STATUSES.includes(error.response.status)) return undefined;
  const value = error.response.headers.get("retry-after");
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
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
      signal?.removeEventListener?.("abort", onAbort);
      reject(new CanceledError(null, config));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort);
  });
}

// Each list is lower-cased right after it is validated: the plugin's once, a per-request override's
// on the request that carries it.
function retriesMethod(config: InternalFaxiosRequestConfig, perRequest: RetryOptions | undefined, pluginMethods: ReadonlyArray<string> | undefined): boolean {
  const requestMethods = perRequest ? ownValue(perRequest, "methods")?.map(m => m.toLowerCase()) : undefined;
  const methods = requestMethods ?? pluginMethods ?? IDEMPOTENT_METHODS;
  return methods.includes(String(ownValue(config, "method") ?? "get").toLowerCase());
}

type Policy = {
  attempts: number;
  retryOn: (error: unknown, attempt: number) => boolean;
  delay: number | ((attempt: number, error: unknown) => number);
  maxDelay: number;
  jitter: "full" | "none";
  maxRetryAfter: number;
  respectRetryAfter: boolean;
  onRetry: ((error: unknown, attempt: number, delayMs: number) => void) | undefined;
};

// Per field, request first: no merged object, and only own properties count.
function resolvePolicy(options: RetryOptions, perRequest: RetryOptions | undefined): Policy {
  const setting = <K extends keyof RetryOptions>(key: K) => (perRequest ? ownValue(perRequest, key) : undefined) ?? ownValue(options, key);
  const statuses = setting("statuses") ?? DEFAULT_STATUSES;
  return {
    attempts: setting("attempts") ?? 3,
    retryOn: setting("retryOn") ?? ((error: unknown) => retryByDefault(error, statuses)),
    delay: setting("delay") ?? doublingDelay,
    maxDelay: setting("maxDelay") ?? 30_000,
    jitter: setting("jitter") ?? "full",
    maxRetryAfter: setting("maxRetryAfter") ?? 300_000,
    respectRetryAfter: setting("respectRetryAfter") ?? true,
    onRetry: setting("onRetry"),
  };
}

// How long to wait before the next try, or undefined when the server's Retry-After is longer
// than the caller is willing to wait, so the error is rethrown.
function waitBeforeRetry(error: unknown, attempt: number, policy: Policy, config: InternalFaxiosRequestConfig): number | undefined {
  const retryAfter = policy.respectRetryAfter ? retryAfterMs(error) : undefined;
  if (retryAfter !== undefined) return retryAfter > policy.maxRetryAfter ? undefined : retryAfter;
  const computed: unknown = typeof policy.delay === "function" ? policy.delay(attempt, error) : policy.delay;
  if (!isWait(computed)) {
    throw new FaxiosError(`retry: delay must give a finite number of at least 0, got ${String(computed)}`, FaxiosError.ERR_BAD_OPTION_VALUE, config);
  }
  const capped = Math.min(computed, policy.maxDelay);
  // Jitter only spreads out clients that failed together; it needs no unpredictability.
  // eslint-disable-next-line sonarjs/pseudo-random -- see above
  return policy.jitter === "full" ? Math.floor(Math.random() * capped) : capped;
}

/**
 * Retries failed requests by calling `next` again. Each `next` dispatches its own copy of the
 * config, so every try starts from the same input. Install it inside middleware that should run
 * once per request (for example `timing` installed first measures all tries together).
 */
export function retry(options: RetryOptions = {}): FaxiosPlugin<{ options: RetryRequestOptions; }> {
  assertRetryOptions(options);
  // Lower-cased once here, so requests compare names without re-casing the list.
  const pluginMethods = ownValue(options, "methods")?.map(m => m.toLowerCase());
  return definePlugin({
    name: "retry",
    middleware: async (ctx: FaxiosContext<RetryRequestOptions>, next) => {
      const perRequest = ownValue(ctx.config, "retry");
      if (perRequest === false) return next(ctx);
      if (perRequest !== undefined) assertRetryOptions(perRequest, ctx.config);
      const policy = resolvePolicy(options, perRequest);
      if (!retriesMethod(ctx.config, perRequest, pluginMethods)) return next(ctx);

      // Tries run one after another on purpose: each must finish before deciding on the next.
      for (let attempt = 1; ; attempt++) {
        // For timing: the try number, read after next() settles.
        ctx.state[RETRY_ATTEMPT] = attempt;
        try {
          // eslint-disable-next-line no-await-in-loop -- see above
          return await next(ctx);
        }
        catch (error) {
          if (attempt >= policy.attempts || !canReplay(ownValue(ctx.config, "data")) || !policy.retryOn(error, attempt)) throw error;
          const ms = waitBeforeRetry(error, attempt, policy, ctx.config);
          if (ms === undefined) throw error;
          // A throwing hook rejects the request with its own error, before any wait.
          policy.onRetry?.(error, attempt, ms);
          // eslint-disable-next-line no-await-in-loop -- see above
          await wait(ms, ownValue(ctx.config, "signal"), ctx.config);
        }
      }
    },
  });
}
