// Native Fetch, retry stage: the validated endpoint plus a hand-written retry helper with the same
// policy as the faxios retry plugin's defaults (see RetryPolicy in ../types.ts).
import { userPathSchema, userQuerySchema, userSchema } from "../schemas.ts";
import type { HttpMethod, RetryFixtureOptions, RetryGetUserInput, RetryPolicy, SendInput, SendResult } from "../types.ts";
import { HttpError } from "./basic.ts";
import { parse } from "./validated.ts";

export { HttpError };
export { ValidationError } from "./validated.ts";

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Attempt timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

// Keeps the response headers, for Retry-After.
class RetryableHttpError extends HttpError {
  readonly headers: Headers;

  constructor(response: Response) {
    super(response);
    this.headers = response.headers;
  }
}

type Policy = Required<RetryPolicy>;

const STATUSES: ReadonlyArray<number> = [ 408, 429, 500, 502, 503, 504 ];
const RETRY_AFTER_STATUSES: ReadonlyArray<number> = [ 429, 503 ];
const IDEMPOTENT: ReadonlyArray<HttpMethod> = [ "get", "head", "options", "put", "delete", "query" ];

// Per field, the request's override first, then the client's policy, then the defaults.
function resolvePolicy(defaults: RetryPolicy, request: RetryPolicy | undefined): Policy {
  const pick = <K extends keyof RetryPolicy>(key: K) => request?.[key] ?? defaults[key];
  return {
    attempts: pick("attempts") ?? 3,
    attemptTimeout: pick("attemptTimeout") ?? 0,
    delay: pick("delay") ?? ((attempt: number) => 100 * 2 ** (attempt - 1)),
    jitter: pick("jitter") ?? "full",
    maxDelay: pick("maxDelay") ?? 30_000,
    maxRetryAfter: pick("maxRetryAfter") ?? 300_000,
    methods: pick("methods") ?? IDEMPOTENT,
    respectRetryAfter: pick("respectRetryAfter") ?? true,
    statuses: pick("statuses") ?? STATUSES,
  };
}

// Delay-seconds or an HTTP date; undefined when the header is missing or unusable.
function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof RetryableHttpError) || !RETRY_AFTER_STATUSES.includes(error.status)) return undefined;
  const value = error.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// The wait before the next attempt, or undefined to stop: Retry-After when the server sent one,
// otherwise the backoff capped at maxDelay and then jittered.
function waitFor(error: unknown, attempt: number, policy: Policy): number | undefined {
  const retryAfter = policy.respectRetryAfter ? retryAfterMs(error) : undefined;
  if (retryAfter !== undefined) return retryAfter > policy.maxRetryAfter ? undefined : retryAfter;
  const backoff = Math.min(typeof policy.delay === "function" ? policy.delay(attempt, error) : policy.delay, policy.maxDelay);
  return policy.jitter === "full" ? Math.floor(Math.random() * backoff) : backoff;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    reject(signal.reason);
    return promise;
  }
  const onAbort = () => {
    clearTimeout(timer);
    reject(signal?.reason);
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve();
  }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
  return promise;
}

// One attempt, with its own deadline when attemptTimeout is set. The caller's signal still aborts it.
async function attempt<T>(run: (signal: AbortSignal | undefined) => Promise<T>, signal: AbortSignal | undefined, timeout: number): Promise<T> {
  if (timeout <= 0) return run(signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError(timeout)), timeout);
  try {
    return await run(signal ? AbortSignal.any([ signal, controller.signal ]) : controller.signal);
  }
  catch (error) {
    throw controller.signal.aborted && !signal?.aborted ? controller.signal.reason : error;
  }
  finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(
  run: (signal: AbortSignal | undefined) => Promise<T>,
  { method, body, signal }: Pick<SendInput, "body" | "method" | "signal">,
  policy: Policy
): Promise<T> {
  if (!policy.methods.includes(method)) return attempt(run, signal, policy.attemptTimeout);
  // A stream is consumed by the first attempt, so a retry would send nothing.
  const replayable = !(body instanceof ReadableStream);
  for (let n = 1; ; n++) {
    try {
      // eslint-disable-next-line no-await-in-loop -- attempts run one after another
      return await attempt(run, signal, policy.attemptTimeout);
    }
    catch (error) {
      // Statuses from the policy, network failures (fetch rejects them with a TypeError) and
      // attempt timeouts; never a cancellation, which rejects with the signal's reason.
      const retryable = error instanceof HttpError
        ? policy.statuses.includes(error.status)
        : error instanceof TimeoutError || error instanceof TypeError;
      const ms = replayable && !signal?.aborted && n < policy.attempts && retryable ? waitFor(error, n, policy) : undefined;
      if (ms === undefined) throw error;
      // eslint-disable-next-line no-await-in-loop -- see above
      await sleep(ms, signal);
    }
  }
}

export function createRetrying({ baseURL, fetch = globalThis.fetch, retry: defaults = {} }: RetryFixtureOptions) {
  async function send({ method, path, body, signal, retry }: SendInput): Promise<SendResult> {
    const isStream = body instanceof ReadableStream;
    const init: RequestInit & { duplex?: "half"; } = {
      method: method.toUpperCase(),
      headers: { accept: "application/json", ...(body && !isStream && { "content-type": "application/json" }) },
      ...(body && { body: isStream ? body : JSON.stringify(body) }),
      // Node's fetch needs this for a stream body.
      ...(isStream && { duplex: "half" }),
    };
    const run = async (attemptSignal: AbortSignal | undefined): Promise<SendResult> => {
      const response = await fetch(`${baseURL}${path}`, { ...init, signal: attemptSignal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new RetryableHttpError(response);
      }
      return { status: response.status, data: await response.json() };
    };
    if (retry === false) return run(signal);
    return withRetry(run, { method, body, signal }, resolvePolicy(defaults, retry));
  }

  // The validated endpoint from the previous stage, sent through send().
  async function getUser({ path, query, signal, retry }: RetryGetUserInput) {
    const { id } = parse(userPathSchema, path, "path");
    const { fields, limit } = parse(userQuerySchema, query, "query");
    const search = new URLSearchParams({ fields, limit: String(limit) });
    const { data } = await send({ method: "get", path: `/users/${encodeURIComponent(id)}?${search}`, signal, retry });
    return parse(userSchema, data, "response");
  }

  return { getUser, send };
}
