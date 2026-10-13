// Axios, retry stage: the validated endpoint plus a response interceptor with the same policy as
// the faxios retry plugin's defaults (see RetryPolicy in ../types.ts). The interceptor sends the
// request again with instance.request(), so every attempt runs the instance's interceptors.
import axios, { AxiosError, CanceledError } from "axios";
import type { AxiosResponse, GenericAbortSignal, InternalAxiosRequestConfig } from "axios";
import { userPathSchema, userQuerySchema, userSchema } from "../schemas.ts";
import type { HttpMethod, RetryFixtureOptions, RetryGetUserInput, RetryOverride, RetryPolicy, SendInput, SendResult } from "../types.ts";
import { parse } from "./validated.ts";

export { ValidationError } from "./validated.ts";

declare module "axios" {
  interface AxiosRequestConfig {
    retry?: RetryOverride;
    // Which attempt this is, counting from 1. Set by the interceptor.
    retryAttempt?: number;
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
function retryAfterMs(response: AxiosResponse | undefined): number | undefined {
  if (!response || !RETRY_AFTER_STATUSES.includes(response.status)) return undefined;
  const value = String(response.headers["retry-after"] ?? "").trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// The wait before the next attempt, or undefined to stop: Retry-After when the server sent one,
// otherwise the backoff capped at maxDelay and then jittered.
function waitFor(error: AxiosError, attempt: number, policy: Policy): number | undefined {
  const retryAfter = policy.respectRetryAfter ? retryAfterMs(error.response) : undefined;
  if (retryAfter !== undefined) return retryAfter > policy.maxRetryAfter ? undefined : retryAfter;
  const backoff = Math.min(typeof policy.delay === "function" ? policy.delay(attempt, error) : policy.delay, policy.maxDelay);
  return policy.jitter === "full" ? Math.floor(Math.random() * backoff) : backoff;
}

// Rejects the way Axios rejects a canceled request, so callers keep using axios.isCancel().
function sleep(ms: number, signal: GenericAbortSignal | undefined, config: InternalAxiosRequestConfig): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    reject(new CanceledError(undefined, config));
    return promise;
  }
  const onAbort = () => {
    clearTimeout(timer);
    reject(new CanceledError(undefined, config));
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener?.("abort", onAbort);
    resolve();
  }, ms);
  signal?.addEventListener?.("abort", onAbort);
  return promise;
}

export function createRetrying({ baseURL, fetch, retry: defaults = {} }: RetryFixtureOptions) {
  const api = axios.create({ baseURL, adapter: "fetch", ...(fetch && { env: { fetch } }) });

  // Axios's timeout covers one call to request(), so here it is the per-attempt timeout.
  api.interceptors.request.use(config => {
    if (config.retry === false) return config;
    const { attemptTimeout } = resolvePolicy(defaults, config.retry);
    if (attemptTimeout > 0) config.timeout = attemptTimeout;
    return config;
  });

  api.interceptors.response.use(undefined, async (error: unknown) => {
    if (axios.isCancel(error) || !axios.isAxiosError(error) || !error.config) throw error;
    const { config } = error;
    if (config.retry === false) throw error;
    const policy = resolvePolicy(defaults, config.retry);
    const attempt = config.retryAttempt ?? 1;
    const method = (config.method ?? "get").toLowerCase() as HttpMethod;
    // Statuses from the policy, network failures and attempt timeouts.
    const retryable = error.response
      ? policy.statuses.includes(error.response.status)
      : error.code === AxiosError.ERR_NETWORK || error.code === AxiosError.ETIMEDOUT;
    // A stream is consumed by the first attempt, so a retry would send nothing.
    const replayable = !(config.data instanceof ReadableStream);
    const ms = policy.methods.includes(method) && replayable && !config.signal?.aborted && attempt < policy.attempts && retryable
      ? waitFor(error, attempt, policy)
      : undefined;
    if (ms === undefined) throw error;
    await sleep(ms, config.signal, config);
    return api.request({ ...config, retryAttempt: attempt + 1 });
  });

  async function send({ method, path, body, signal, retry }: SendInput): Promise<SendResult> {
    const response = await api.request<unknown>({ method, url: path, data: body, signal, retry });
    return { status: response.status, data: response.data };
  }

  async function getUser({ path, query, signal, retry }: RetryGetUserInput) {
    const { id } = parse(userPathSchema, path, "path");
    const params = parse(userQuerySchema, query, "query");
    const response = await api.get<unknown>(`/users/${encodeURIComponent(id)}`, { params, signal, retry });
    return parse(userSchema, response.data, "response");
  }

  return { getUser, send };
}
