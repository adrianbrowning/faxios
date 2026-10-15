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

`attempts` must be an integer from 1 to 10, in the plugin options and in a per-request override alike. Anything else, including `11` or `Infinity`, rejects with `ERR_BAD_OPTION_VALUE` before a request is sent. Each try is a full request, so the cap keeps one call from turning into a flood against a server that is already failing.

## Waiting between tries

### Backoff

`delay` is the wait before the next try, in milliseconds, or a function `(attempt, error) => ms`. The default starts at 100ms and doubles on each try. The wait is capped at `maxDelay` (default 30 seconds). `maxDelay` and `maxRetryAfter` must be from 0 to 2147483647 milliseconds (the longest delay `setTimeout` supports); a larger value rejects with `ERR_BAD_OPTION_VALUE`, so a wait can never overflow into an immediate retry.

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

On a 429 or 503 with a `Retry-After` header, faxios waits exactly what the header asks for. The header may be delay-seconds (digits only) or an HTTP date in one of the three RFC 9110 forms (`Sun, 06 Nov 1994 08:49:37 GMT`, `Sunday, 06-Nov-94 08:49:37 GMT` or `Sun Nov  6 08:49:37 1994`); a date in the past retries at once. Any other value, such as `1.5`, `-1` or `12/25`, is ignored and the computed backoff applies. Neither jitter nor `maxDelay` applies to this wait.

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

Log `error.toJSON()` rather than the error itself. A `FaxiosError` carries the request config, headers included, and loggers such as `console.warn` print every field. `toJSON()` masks the `authorization`, `proxy-authorization`, `cookie` and `auth` keys and strips `user:pass@` from the URL; list any other secret keys in [`redact`](/pages/advanced/request-config#redact).

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry({
  onRetry: (error, attempt, delayMs) => {
    const reason = faxios.isFaxiosError(error) ? error.toJSON() : error;
    console.warn(`Try ${attempt} failed, retrying in ${delayMs}ms`, reason);
  },
}));

await api.get("/users");
```

## Timeouts

The request's [`timeout`](/pages/advanced/request-config#timeout) bounds all tries together: every try, every wait between them and the middleware around them. Once it passes, the request rejects with `ETIMEDOUT`, the pending try or wait stops at once, and `retry` doesn't try again or call `onRetry`, however many attempts are left.

`attemptTimeout` bounds each try on its own, in milliseconds: middleware installed after `retry`, the schemas and the `fetch`, until that try's response arrives. A try that runs out is aborted and rejects with `ETIMEDOUT`, which the default predicate retries. The default is `0`, no limit per try; it must be from 0 to 2147483647. Use the two together to give up on a hung try early while still capping the whole request:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

// Each try gets 2 seconds; the request gives up after 5 seconds in all.
const api = faxios.create({ baseURL: "https://api.example.com", timeout: 5_000 })
  .use(retry({ attempts: 4, attemptTimeout: 2_000 }));

await api.get("/users");
await api.get("/reports/latest", { retry: { attemptTimeout: 10_000 } });
```

With `attemptTimeout`, middleware after `retry` gets a context whose `ctx.config.signal` is the try's own signal. A `responseType: "stream"` body read after the response arrives isn't bounded by `attemptTimeout`, whose timer stops when the try's response arrives; the request's `timeout` and your `signal` still govern it until the body is read or cancelled. When `retry` drops a status error, because it tries again or because `onRetry` or `delay` threw, it cancels that error's stream body, which nothing else reads, so its connection is released; a body `onRetry` started reading is left to it.

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

A request with a stream body (a web `ReadableStream`, a Node stream or an async iterable such as an async generator) is never retried, since the first try consumed it.

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

Before each try, `retry` sets [`ctx.attempt`](/pages/advanced/middleware#the-context) to the try's number, counting from 1. Middleware installed after `retry` reads the current try's number there; `timing` reports it as `event.attempt`.

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

An abort during a backoff wait rejects with `CanceledError` straight away, and a cancellation is never retried. As at every other stage, the error keeps the abort reason as its `cause`:

```js expect=log:Request%20aborted%20by%20user
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry());
const controller = new AbortController();

const request = api.get("/api/data", { signal: controller.signal });

// Cancel the request (and any pending retry wait) while it is in flight,
// for example when the user leaves the page:
controller.abort();

try {
  await request;
} catch (error) {
  if (faxios.isCancel(error)) {
    console.log("Request aborted by user");
  }
}
```

## Writing your own retry middleware

If the plugin's policy doesn't fit, a middleware can call `next` again itself. Each `next()` dispatches its own copy of the config, so calling it twice is safe when the body can be read again, such as a string, an object, a `Blob` or `FormData`. A stream body is used up by the first try, so sending it again rejects with a `FaxiosError` whose code is `ERR_BAD_REQUEST`. Set `ctx.attempt` before each try, as `retry` does, so `timing` and other middleware see the try number:

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  try {
    return await next(ctx);
  } catch (err) {
    // Retry once on a network error
    if (!(err instanceof FaxiosError) || err.code !== FaxiosError.ERR_NETWORK) throw err;
    ctx.attempt = 2;
    return next(ctx);
  }
});

await api.get("/users");
```

See [Writing a plugin](/pages/advanced/middleware#writing-a-plugin) to package it with typed request options.
