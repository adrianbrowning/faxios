// Types the fixtures share. Type-only, so no fixture bundle carries any of it.
import type { GetUserInput } from "./schemas.ts";

export type FixtureOptions = {
  baseURL: string;
  // The transport. Omitted, each client uses globalThis.fetch.
  fetch?: typeof globalThis.fetch;
};

export type HttpMethod = "delete" | "get" | "head" | "options" | "patch" | "post" | "put" | "query";

// The retry policy all three retry fixtures implement, with the faxios retry plugin's option names
// and defaults: 3 total attempts, 100ms doubling capped at 30s, full jitter, Retry-After on 429/503
// up to 300s, idempotent methods only, statuses 408/429/500/502/503/504, network errors and
// per-attempt timeouts.
export type RetryPolicy = {
  attempts?: number;
  attemptTimeout?: number;
  delay?: ((attempt: number, error: unknown) => number) | number;
  jitter?: "full" | "none";
  maxDelay?: number;
  maxRetryAfter?: number;
  methods?: ReadonlyArray<HttpMethod>;
  respectRetryAfter?: boolean;
  statuses?: ReadonlyArray<number>;
};

// `false` turns retries off for one request; an object overrides the client's policy per field.
export type RetryOverride = false | RetryPolicy;

export type RetryFixtureOptions = FixtureOptions & { retry?: RetryPolicy; };

export type RetryGetUserInput = GetUserInput & { retry?: RetryOverride; };

export type SendInput = {
  body?: ReadableStream<Uint8Array> | Record<string, unknown>;
  method: HttpMethod;
  path: string;
  retry?: RetryOverride;
  signal?: AbortSignal;
};

export type SendResult = { data: unknown; status: number; };
