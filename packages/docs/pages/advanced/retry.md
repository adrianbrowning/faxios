# Retry and error recovery

Network requests can fail for transient reasons — a server blip, a brief network drop, or a rate-limit response. Implementing a retry strategy in an interceptor lets you handle these failures transparently, without cluttering your application code.

## Basic retry with a response interceptor

The simplest approach is to catch specific error status codes and immediately re-send the original request a limited number of times:

```ts
import faxios, { isFaxiosError } from "@gcmdev/faxios";
import type { InternalFaxiosRequestConfig } from "@gcmdev/faxios";

// Extra fields on the config travel with the request, so they can count attempts.
type RetryConfig = InternalFaxiosRequestConfig & { _retryCount?: number };

const api = faxios.create({ baseURL: "https://api.example.com" });

const MAX_RETRIES = 3;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!isFaxiosError(error) || !error.config) {
      return Promise.reject(error);
    }
    const config: RetryConfig = error.config;

    // Only retry on network errors or 5xx server errors
    const shouldRetry =
      !error.response || (error.response.status >= 500 && error.response.status < 600);

    if (!shouldRetry) {
      return Promise.reject(error);
    }

    config._retryCount = config._retryCount ?? 0;

    if (config._retryCount >= MAX_RETRIES) {
      return Promise.reject(error);
    }

    config._retryCount += 1;
    return api(config);
  }
);
```

## Exponential backoff

Retrying immediately after a failure can overload an already-struggling server. Exponential backoff waits progressively longer between each attempt:

```ts
import faxios, { isFaxiosError } from "@gcmdev/faxios";
import type { InternalFaxiosRequestConfig } from "@gcmdev/faxios";

type RetryConfig = InternalFaxiosRequestConfig & { _retryCount?: number };

const api = faxios.create({ baseURL: "https://api.example.com" });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!isFaxiosError(error) || !error.config) return Promise.reject(error);
    const config: RetryConfig = error.config;

    const shouldRetry =
      !error.response || (error.response.status >= 500 && error.response.status < 600);

    if (!shouldRetry) return Promise.reject(error);

    config._retryCount = config._retryCount ?? 0;

    if (config._retryCount >= 3) return Promise.reject(error);

    config._retryCount += 1;

    // Wait 200ms, 400ms, 800ms, ... before each retry
    const backoff = 100 * 2 ** config._retryCount;
    await delay(backoff);

    return api(config);
  }
);
```

## Retrying on 429 (rate limit) with Retry-After

When the server responds with `429 Too Many Requests`, it often includes a `Retry-After` header telling you exactly how long to wait:

```ts
import faxios, { isFaxiosError } from "@gcmdev/faxios";
import type { InternalFaxiosRequestConfig } from "@gcmdev/faxios";

type RetryConfig = InternalFaxiosRequestConfig & { _retryCount?: number };

const api = faxios.create({ baseURL: "https://api.example.com" });

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!isFaxiosError(error) || !error.config) return Promise.reject(error);
    const config: RetryConfig = error.config;

    if (error.response?.status !== 429) return Promise.reject(error);

    config._retryCount = config._retryCount ?? 0;
    if (config._retryCount >= 3) return Promise.reject(error);

    config._retryCount += 1;

    // The header is in seconds; default to 1 second when it is missing
    const retryAfter = Number(error.response.headers.get("retry-after"));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : 1000;

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return api(config);
  }
);
```

## Opting out of retries per request

If some requests should never be retried (e.g. non-idempotent mutations you don't want to duplicate), add a flag to the request config:

```js check=skip
// Add this to your interceptor before the retry logic:
if (config._noRetry) return Promise.reject(error);

// Then opt out on specific calls:
await api.post("/payments/charge", body, { _noRetry: true });
```

## Combining retry with cancellation

Use an `AbortController` to cancel a request that is waiting for a backoff delay:

```js
import faxios from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" });
const controller = new AbortController();

try {
  await api.get("/api/data", { signal: controller.signal });
} catch (error) {
  if (faxios.isCancel(error)) {
    console.log("Request aborted by user");
  }
}

// Cancel the request (and any pending retry delay) from elsewhere:
controller.abort();
```
