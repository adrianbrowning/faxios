# Retry and error recovery

Network requests can fail for transient reasons: a server blip, a brief network drop, or a rate-limit response. The built-in `retry` plugin handles these failures in one place, so your application code doesn't have to.

## The `retry` plugin

Import it from its own subpath and install it with `.use()`:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry());

const response = await api.get("/users");
console.log(response.status);
```

`use()` returns the same instance with a new type. Keep the chained result: it is the value whose type knows about the plugin's `retry` request option.

`retry` works by calling `next` again when a try fails. See [Middleware](/pages/advanced/middleware) for how that works.

## What gets retried

By default, `retry` retries:

- network errors (`ERR_NETWORK`) and timeouts (`ETIMEDOUT`);
- the statuses 408, 429, 500, 502, 503 and 504.

It does not retry 501, 505 or any other 5xx, since those mean the server will never handle the request. It never retries a cancellation.

`statuses` replaces the default status list:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry({ statuses: [ 429, 503 ] }));

await api.get("/users");
```

::: warning A custom `retryOn` replaces the whole default
`retryOn(error, attempt)` replaces the entire default predicate, not just the status list. Network errors and timeouts are retried only if your function says so, and `statuses` is ignored when both are set.
:::

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry({
  // Only network errors, nothing else
  retryOn: (error) => error instanceof FaxiosError && error.code === FaxiosError.ERR_NETWORK,
}));

await api.get("/users");
```

## Attempts

`attempts` counts every try, including the first. The default is 3: one request and up to two retries.

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry({ attempts: 5 }));

await api.get("/users");
```

`attempts` must be an integer of at least 1. Anything else, including `Infinity`, rejects with `ERR_BAD_OPTION_VALUE` before a request is sent.

## Waiting between tries

### Backoff

`delay` is the wait before the next try, in milliseconds, or a function `(attempt, error) => ms`. The default starts at 100ms and doubles on each try. The wait is capped at `maxDelay` (default 30 seconds).

`jitter` then picks the actual wait:

- `"full"` (default) waits a random time between 0 and the capped backoff, so clients that failed together don't retry together.
- `"none"` waits the capped backoff exactly.

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry({
  delay: (attempt) => 250 * attempt,
  maxDelay: 2000,
  jitter: "none",
}));

await api.get("/users");
```

### `Retry-After`

On a 429 or 503 with a `Retry-After` header, faxios waits exactly what the header asks for. The header may be delay-seconds or an HTTP date; a date in the past retries at once. Neither jitter nor `maxDelay` applies to this wait.

If the header asks for longer than `maxRetryAfter` (default 5 minutes), faxios doesn't wait: it rethrows the response's error without retrying.

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

// Give up straight away if the server asks for more than 10 seconds
const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry({ maxRetryAfter: 10_000 }));

await api.get("/users");
```

`respectRetryAfter: false` (default `true`) turns this off: every retry waits the computed backoff, and `maxRetryAfter` doesn't apply. It doesn't change which requests retry. Use it when another plugin, such as a queue throttle, honours `Retry-After` itself.

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

// A throttle installed elsewhere waits out Retry-After; retry only backs off
const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry({ respectRetryAfter: false }));

await api.get("/users");
```

### Logging retries

`onRetry(error, attempt, delayMs)` runs before each wait. If it throws, the request rejects with that error and stops retrying.

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry({
  onRetry: (error, attempt, delayMs) => {
    console.warn(`Try ${attempt} failed, retrying in ${delayMs}ms`, error);
  },
}));

await api.get("/users");
```

## Methods

Only idempotent methods are retried by default: GET, HEAD, OPTIONS, PUT, DELETE and QUERY. POST and PATCH are retried only when you list them in `methods` (in any case). Do that only if your API dedupes repeated requests, or a retried payment may be charged twice.

The method check runs before the predicate: a method not in `methods` is never retried and `retryOn` isn't called. To retry POST with a custom `retryOn`, list POST in `methods` too.

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry({ methods: [ "GET", "POST" ] }));

await api.post("/search", { q: "faxios" });
```

Each `methods` entry must be an HTTP method token (RFC 9110). An empty or non-token name, such as `""` or `"GET POST"`, rejects with `ERR_BAD_OPTION_VALUE`.

A request with a stream body (a web `ReadableStream` or a Node stream) is never retried, since the first try consumed it.

## Per-request options

Installing `retry` adds a `retry` request option. `retry: false` turns retries off for one request, and `retry: { … }` overrides fields of the plugin's options:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry({ methods: [ "GET", "POST" ] }));

// Never repeat this one
await api.post("/payments/charge", { amount: 100 }, { retry: false });

// Try harder for this one
await api.get("/reports/latest", { retry: { attempts: 6 } });
```

## Ordering with other plugins

Middleware runs in the order it is installed, so where `retry` sits matters:

- Install `timing` before `retry` to measure all tries together, or after it to measure each try.
- Install `retry` before `authBearer` and the token is fetched again on every try.

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";
import { timing } from "@gcmdev/faxios/plugins/timing";

// One timing event per try
const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry())
  .use(timing((event) => console.log(event.attempt, event.durationMs)));

await api.get("/users");
```

## Combining retry with cancellation

An abort during a backoff wait rejects with `CanceledError` straight away, and a cancellation is never retried:

```js
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry());
const controller = new AbortController();

try {
  await api.get("/api/data", { signal: controller.signal });
} catch (error) {
  if (faxios.isCancel(error)) {
    console.log("Request aborted by user");
  }
}

// Cancel the request (and any pending retry wait) from elsewhere:
controller.abort();
```

## Writing your own retry middleware

If the plugin's policy doesn't fit, a middleware can call `next` again itself. Each `next()` dispatches its own copy of the config, so calling it twice is safe:

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  try {
    return await next(ctx);
  } catch (err) {
    // Retry once on a network error
    if (!(err instanceof FaxiosError) || err.code !== FaxiosError.ERR_NETWORK) throw err;
    return next(ctx);
  }
});

await api.get("/users");
```

See [Writing a plugin](/pages/advanced/middleware#writing-a-plugin) to package it with typed request options.
