// @ts-self-types="./retry.d.ts" — required for Deno: maps built .js to adjacent .d.ts in dist/

import type { FaxiosContext, FaxiosNext, FaxiosPlugin, FaxiosRequestConfig, FaxiosResponse, InternalFaxiosRequestConfig, Method } from "../../index.js";
import canceledFromSignal from "../cancel/canceledFromSignal.js";
import isCancel from "../cancel/isCancel.js";
import assertSignal from "../core/assertSignal.js";
import FaxiosError from "../core/FaxiosError.js";
import raceAbort, { onAbort } from "../helpers/raceAbort.js";
import { definePlugin } from "./definePlugin.js";
import { assertOptions, canReplay, discardBody, isBoolean, isFunction, isStatusList, own, TOKEN } from "./shared.js";

// setTimeout fires at once for anything longer: it keeps the delay as a signed 32-bit integer.
const MAX_TIMER_MS = 2_147_483_647;

// Each try is a full request, so a large count turns one call into a flood against a failing server.
const MAX_ATTEMPTS = 10;

const isWait = (ms: unknown): ms is number => typeof ms === "number" && Number.isFinite(ms) && ms >= 0;

// A wait a timer can hold: setTimeout fires at once for anything longer.
const isTimerWait = (ms: unknown) => isWait(ms) && ms <= MAX_TIMER_MS;

// Bounded on purpose: NaN or Infinity would make a failing request loop forever.
const optionsSchema = {
  attempts: (value: unknown) => (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_ATTEMPTS) || `an integer from 1 to ${MAX_ATTEMPTS}`,
  attemptTimeout: (value: unknown) => isTimerWait(value) || `a number of milliseconds from 0 to ${MAX_TIMER_MS}`,
  retryOn: isFunction,
  delay: (value: unknown) => isWait(value) || typeof value === "function" || "a finite number of at least 0 or a function",
  methods: (value: unknown) => (Array.isArray(value) && value.every(m => typeof m === "string" && TOKEN.test(m))) || "an array of HTTP method names",
  statuses: isStatusList,
  maxRetryAfter: (value: unknown) => isTimerWait(value) || `a number of milliseconds from 0 to ${MAX_TIMER_MS}`,
  maxDelay: (value: unknown) => isTimerWait(value) || `a number of milliseconds from 0 to ${MAX_TIMER_MS}`,
  jitter: (value: unknown) => value === "full" || value === "none" || "\"full\" or \"none\"",
  respectRetryAfter: isBoolean,
  onRetry: isFunction,
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
  assertOptions(value, optionsSchema, "retry", config);
}

// `x?: T | undefined` lets a consumer with `exactOptionalPropertyTypes` pass the `undefined` the
// option checks treat as unset.
/* eslint-disable sonarjs/no-redundant-optional -- see above */
export type RetryOptions = {
  /** Total tries, counting the first request: an integer from 1 to 10. Default 3. */
  attempts?: number | undefined;
  /**
   * The most one try may take, in milliseconds: middleware installed after `retry`, the schemas
   * and the fetch, until the try's response arrives. A try that runs out rejects with `ETIMEDOUT`,
   * which the default predicate retries. Default 0: no limit per try. The request's `timeout` still
   * bounds all tries and waits together. At most 2 147 483 647 (the setTimeout limit).
   */
  attemptTimeout?: number | undefined;
  /**
   * Milliseconds to wait before the next try, or a function of the try that failed. Default 100ms,
   * doubling. Capped at `maxDelay`, then jittered. A 429 or 503 with a `Retry-After` header waits
   * that long instead, unless `respectRetryAfter` is `false`.
   */
  delay?: ((attempt: number, error: unknown) => number) | number | undefined;
  /**
   * `"full"` (default) waits a random time between 0 and the capped backoff, so clients that failed
   * together don't retry together; `"none"` waits the capped backoff. Doesn't apply to `Retry-After`.
   */
  jitter?: "full" | "none" | undefined;
  /**
   * The most the computed backoff waits, in milliseconds. Default 30 000, at most 2 147 483 647
   * (the setTimeout limit). Doesn't apply to `Retry-After`.
   */
  maxDelay?: number | undefined;
  /**
   * The longest `Retry-After` (seconds or an HTTP date, on a 429 or 503) to wait, in milliseconds.
   * Default 300 000 (5 minutes), at most 2 147 483 647 (the setTimeout limit). A longer one rejects
   * with the response's error instead of retrying.
   * Ignored when `respectRetryAfter` is `false`.
   */
  maxRetryAfter?: number | undefined;
  /**
   * HTTP methods that may be retried, in any case. Default: GET, HEAD, OPTIONS, PUT, DELETE and
   * QUERY. POST and PATCH aren't idempotent, so add them only if your API dedupes repeats. A request
   * whose method isn't listed is never retried, whatever `retryOn` or `statuses` say.
   */
  methods?: ReadonlyArray<Method> | undefined;
  /**
   * Called before each wait with the error, the try that failed and the wait in milliseconds. If it
   * throws, the request rejects with that error and stops retrying.
   */
  onRetry?: ((error: unknown, attempt: number, delayMs: number) => void) | undefined;
  /**
   * Whether a 429 or 503's `Retry-After` header sets the wait. Default `true`. With `false`, every
   * retry waits the computed backoff and `maxRetryAfter` doesn't apply; which requests retry doesn't
   * change. Turn it off when another plugin, such as a queue throttle, honours `Retry-After` itself.
   */
  respectRetryAfter?: boolean | undefined;
  /**
   * Whether the try that just failed should be retried. `attempt` counts from 1.
   * Default: network errors, timeouts and the `statuses`; never a cancellation. A custom `retryOn`
   * replaces that whole predicate, so `statuses` is ignored when both are set. retryOn decides
   * only within `methods`; to retry POST, list it in `methods`.
   */
  retryOn?: ((error: unknown, attempt: number) => boolean) | undefined;
  /**
   * Response statuses the default predicate retries. Default 408, 429, 500, 502, 503 and 504.
   * Ignored when `retryOn` is set.
   */
  statuses?: ReadonlyArray<number> | undefined;
};

/** Per-request override: `false` turns retries off, an object overrides the plugin's options. */
export type RetryRequestOptions = { retry?: false | RetryOptions | undefined; };
/* eslint-enable sonarjs/no-redundant-optional */

function retryByDefault(error: unknown, statuses: ReadonlyArray<number>): boolean {
  if (isCancel(error) || !(error instanceof FaxiosError)) return false;
  if (error.code === FaxiosError.ERR_NETWORK || error.code === FaxiosError.ETIMEDOUT) return true;
  const status = error.response?.status;
  return status !== undefined && statuses.includes(status);
}

// The three HTTP-date forms RFC 9110 §5.6.7 allows: IMF-fixdate, RFC 850 and asctime. Date.parse
// alone accepts far more ("1.5", "-1", "12/25"), which would read as a past date and retry at once.
const DAY = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const LONG_DAY = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)";
const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const TIME = "\\d{2}:\\d{2}:\\d{2}";
const HTTP_DATE = new RegExp(
  `^(?:${DAY}, \\d{2} ${MONTH} \\d{4} ${TIME} GMT`
  + `|${LONG_DAY}, \\d{2}-${MONTH}-\\d{2} ${TIME} GMT`
  + `|${DAY} ${MONTH} [ \\d]\\d ${TIME} \\d{4})$`
);

// The wait a 429 or 503 asks for, in milliseconds: delay-seconds or an HTTP date (a past date
// means now). undefined when there's no usable header, so the computed backoff applies.
function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof FaxiosError) || !error.response || !RETRY_AFTER_STATUSES.includes(error.response.status)) return undefined;
  const value = error.response.headers.get("retry-after");
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  if (!HTTP_DATE.test(trimmed)) return undefined;
  // asctime has no zone; RFC 9110 says it's UTC, but Date.parse would read it as local time.
  const date = Date.parse(/GMT$/.test(trimmed) ? trimmed : `${trimmed} GMT`);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

const doublingDelay = (attempt: number) => 100 * 2 ** (attempt - 1);

// The wait before the next try, or undefined to rethrow `error`, after calling onRetry. A throwing
// hook rejects the request with its own error, before any wait; so does a delay that gives no
// valid wait. Either way `error` is dropped, so its body is too.
function decideRetry(error: unknown, attempt: number, policy: Policy, config: InternalFaxiosRequestConfig): number | undefined {
  try {
    const ms = waitBeforeRetry(error, attempt, policy, config);
    if (ms !== undefined) policy.onRetry?.(error, attempt, ms);
    return ms;
  }
  catch (thrown) {
    discardBody(error);
    throw thrown;
  }
}

// The executor form: the library's TypeScript lib target has no Promise.withResolvers.
function wait(ms: number, signal: FaxiosRequestConfig["signal"], config: InternalFaxiosRequestConfig): Promise<void> {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
  let cancel = () => {};
  return raceAbort(signal, () => new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    cancel = () => clearTimeout(timer);
  }), () => {
    cancel();
    return canceledFromSignal(signal, config);
  });
}

// A try's signal: it aborts when the try's own controller does, or when the request's signal does.
// A listener, never AbortSignal.any(): an any() signal stays linked to the request's signal for as
// long as that lives, and without a `timeout` that is the caller's, perhaps long-lived, signal.
// `unlink` removes the listener once the try settles. A stream body read after that stays under
// the request's signal and timeout through core, not through this link.
function linkSignal(outer: FaxiosRequestConfig["signal"], controller: InstanceType<typeof AbortController>): { signal: InstanceType<typeof AbortController>["signal"]; unlink: () => void; } {
  if (!outer) return { signal: controller.signal, unlink: () => {} };
  const unlink = onAbort(outer, () => controller.abort("reason" in outer ? outer.reason : undefined));
  return { signal: controller.signal, unlink };
}

// One try with its own deadline. It settles once the deadline passes, even while middleware after
// retry never resumes, and its signal aborts that try's fetch.
function tryWithin(ms: number, ctx: FaxiosContext<RetryRequestOptions>, next: FaxiosNext<RetryRequestOptions>): Promise<FaxiosResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new FaxiosError(`timeout of ${ms}ms exceeded`, FaxiosError.ETIMEDOUT, ctx.config));
  }, ms);
  const { signal, unlink } = linkSignal(own(ctx.config, "signal"), controller);
  const stop = () => {
    clearTimeout(timer);
    unlink();
  };
  // raceAbort listens before running next(): middleware may abort before its first await. An
  // abort cleans up in its own handler, so the request's signal holds no listener once it fires.
  // After the deadline the result has nowhere to go; raceAbort still consumes it.
  // Null prototype, like every ctx.config: later middleware must not read inherited keys.
  return raceAbort(signal, () => next({ ...ctx, config: Object.assign(Object.create(null) as InternalFaxiosRequestConfig, ctx.config, { signal }) }), () => {
    stop();
    return canceledFromSignal(signal, ctx.config);
  }).finally(stop);
}

// Each list is lower-cased right after it is validated: the plugin's once, a per-request override's
// on the request that carries it.
function retriesMethod(config: InternalFaxiosRequestConfig, perRequest: RetryOptions | undefined, pluginMethods: ReadonlyArray<string> | undefined): boolean {
  const requestMethods = perRequest ? own(perRequest, "methods")?.map(m => m.toLowerCase()) : undefined;
  const methods = requestMethods ?? pluginMethods ?? IDEMPOTENT_METHODS;
  return methods.includes(String(own(config, "method") ?? "get").toLowerCase());
}

type Policy = {
  attempts: number;
  attemptTimeout: number;
  delay: ((attempt: number, error: unknown) => number) | number;
  jitter: "full" | "none";
  maxDelay: number;
  maxRetryAfter: number;
  onRetry: ((error: unknown, attempt: number, delayMs: number) => void) | undefined;
  respectRetryAfter: boolean;
  retryOn: (error: unknown, attempt: number) => boolean;
};

// Per field, request first: no merged object, and only own properties count.
function resolvePolicy(options: RetryOptions, perRequest: RetryOptions | undefined): Policy {
  const setting = <K extends keyof RetryOptions>(key: K) => (perRequest ? own(perRequest, key) : undefined) ?? own(options, key);
  const statuses = setting("statuses") ?? DEFAULT_STATUSES;
  return {
    attempts: setting("attempts") ?? 3,
    attemptTimeout: setting("attemptTimeout") ?? 0,
    retryOn: setting("retryOn") ?? ((error: unknown) => retryByDefault(error, statuses)),
    delay: setting("delay") ?? doublingDelay,
    maxDelay: setting("maxDelay") ?? 30_000,
    jitter: setting("jitter") ?? "full",
    maxRetryAfter: setting("maxRetryAfter") ?? 300_000,
    respectRetryAfter: setting("respectRetryAfter") ?? true,
    onRetry: setting("onRetry"),
  };
}

// How long to wait before the next try, or undefined to rethrow the error: the request's signal
// aborted (the caller canceled, or the request's timeout passed), no tries are left, the body can't
// be sent again, the predicate says no, or a Retry-After is longer than the caller will wait.
function waitBeforeRetry(error: unknown, attempt: number, policy: Policy, config: InternalFaxiosRequestConfig): number | undefined {
  if (own(config, "signal")?.aborted || attempt >= policy.attempts || !canReplay(own(config, "data")) || !policy.retryOn(error, attempt)) return undefined;
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
  const pluginMethods = own(options, "methods")?.map(m => m.toLowerCase());
  return definePlugin({
    name: "retry",
    options: { retry: true },
    middleware: async (ctx: FaxiosContext<RetryRequestOptions>, next) => {
      const perRequest = own(ctx.config, "retry");
      if (perRequest === false) return next(ctx);
      if (perRequest !== undefined) assertRetryOptions(perRequest, ctx.config);
      const policy = resolvePolicy(options, perRequest);
      if (!retriesMethod(ctx.config, perRequest, pluginMethods)) return next(ctx);
      // Retry listens on the request's signal for its waits and tries, so a signal a middleware
      // before retry passes on that core would refuse gets the error dispatch would give it,
      // before any timer.
      assertSignal(own(ctx.config, "signal"), ctx.config);
      // Tries run one after another on purpose: each must finish before deciding on the next.
      for (let attempt = 1; ; attempt++) {
        // Read by middleware on either side of this one, such as timing.
        ctx.attempt = attempt;
        try {
          // eslint-disable-next-line no-await-in-loop -- see above
          return await (policy.attemptTimeout > 0 ? tryWithin(policy.attemptTimeout, ctx, next) : next(ctx));
        }
        catch (error) {
          const ms = decideRetry(error, attempt, policy, ctx.config);
          if (ms === undefined) throw error;
          discardBody(error);
          // eslint-disable-next-line no-await-in-loop -- see above
          await wait(ms, own(ctx.config, "signal"), ctx.config);
        }
      }
    },
  });
}
