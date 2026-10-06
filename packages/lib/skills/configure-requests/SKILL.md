---
name: configure-requests
description: >
  Use when writing, reviewing or porting code that sends HTTP requests with @gcmdev/faxios:
  creating an instance with baseURL, headers or timeout; cancelling requests; handling
  FaxiosError codes; validating responses with a schema; adding auth, retry or timing with
  .use() middleware and the built-in plugins; or replacing Axios interceptors, CancelToken,
  adapters or proxy options. Not for Axios itself or for other fetch wrappers.
metadata:
  purpose: >
    Teach agents the request surface faxios actually implements (one fetch transport, .use()
    middleware, AbortSignal cancellation, Standard Schema validation) and stop them from
    generating Axios APIs that faxios removed or never verified.
  type: core
  library: '@gcmdev/faxios'
  library_version: '0.1.0'
sources:
  - src/index.ts
  - src/lib/faxios.ts
  - src/lib/core/Faxios.ts
  - src/lib/core/mergeConfig.ts
  - src/lib/core/buildFullPath.ts
  - src/lib/core/dispatchRequest.ts
  - src/lib/core/FaxiosError.ts
  - src/lib/types.ts
  - src/lib/adapters/fetch.ts
  - src/lib/helpers/composeSignals.ts
  - src/lib/plugins/definePlugin.ts
  - src/lib/plugins/authBearer.ts
  - src/lib/plugins/retry.ts
  - src/lib/plugins/timing.ts
  - package.json
  - adrianbrowning/faxios:packages/tests/unit/api.test.ts
  - adrianbrowning/faxios:packages/tests/unit/core/middleware.test.ts
  - adrianbrowning/faxios:packages/tests/unit/plugins/*.test.ts
  - adrianbrowning/faxios:MIGRATION_GUIDE.md
---

# Configure faxios requests

faxios is a promise-based HTTP client with an Axios-like call shape and one transport: the
runtime's `fetch`. It runs in browsers, Node 24+, Deno and Bun, and ships as ESM only.
Assume nothing from Axios that this skill or the installed package's types do not show.
When the installed `@gcmdev/faxios` types disagree with this file, follow the types and report
the mismatch.

## Setup

```ts
import faxios from "@gcmdev/faxios";

const api = faxios.create({
  baseURL: "https://api.example.com/v1",
  timeout: 5000,
  headers: { common: { "X-Client": "web" } },
});

const { data, status } = await api.get<{ id: number; name: string }>("/users/1");
```

- Install with `npm i @gcmdev/faxios`. From CommonJS, load it with `await import("@gcmdev/faxios")`;
  there is no `require` build and no UMD/CDN bundle.
- Check: the call resolves with a `FaxiosResponse` whose `data` is parsed JSON for JSON responses.

## Core patterns

### Choose the right call form

- `api(config)`, `api(url, config?)` and `api.request(config)`.
- `get`, `delete`, `head`, `options` take `(url, config?)`.
- `post`, `put`, `patch`, `query` take `(url, data?, config?)`. `query` sends the HTTP QUERY method.
- `postForm`, `putForm`, `patchForm` send `multipart/form-data`.
- `api.getUri(config)` returns the URL faxios would request, without sending anything.

Path and query parameters:

```ts
import faxios from "@gcmdev/faxios";

const res = await faxios.get("https://api.example.com/users/{id}/posts", {
  pathParams: { id: 42 },
  params: { page: 2, tag: "news" },
});
// GET https://api.example.com/users/42/posts?page=2&tag=news
```

`pathParams` values are `encodeURIComponent`-encoded. A missing or `null` value rejects with
`ERR_BAD_OPTION_VALUE`.

### Merge defaults the way faxios does

`faxios.create(config)` merges `config` over the parent's defaults with `mergeConfig`:

- `url`, `method` and `data` never inherit; they come from the request only.
- `headers` deep-merge case-insensitively. Group headers by method with `common`, `get`, `post`,
  etc.; flat keys apply to every method.
- Arrays such as `transformRequest` and `transformResponse` are replaced, not concatenated.
- An explicit `undefined` in the request clears an inherited `baseURL`, `timeout` or schema.
- `params`, `auth`, `env` and other plain objects deep-merge.
- Middleware added with `.use()` is not copied into `create()` children. Register it on each
  instance that needs it.

To remove an inherited header for one request, set it to `undefined`. To keep a header off the
wire entirely, including ones faxios adds itself, set it to `null` or `false`.

### Validate and type responses with a schema

Any Standard Schema v1 library works (Zod, Valibot, ArkType). Passing `responseSchema` types
`response.data` as the schema's output:

```ts
import faxios, { isSchemaValidationError } from "@gcmdev/faxios";
import { z } from "zod";

const User = z.object({ id: z.number(), name: z.string() });

try {
  const { data } = await faxios.get("https://api.example.com/users/1", { responseSchema: User });
  console.log(data.name);
}
catch (error) {
  if (isSchemaValidationError(error)) console.error(error.code, error.issues);
  else throw error;
}
```

- Order: `pathParamsSchema` → `paramsSchema` → `requestSchema` run before `transformRequest`,
  fail-fast, and nothing is sent when one fails. `responseSchema` runs after `transformResponse`,
  only for responses that pass `validateStatus`.
- Error codes: `ERR_BAD_PATH_PARAMS_SCHEMA`, `ERR_BAD_PARAMS_SCHEMA`, `ERR_BAD_REQUEST_SCHEMA`,
  `ERR_BAD_RESPONSE_SCHEMA`. `error.issues` holds `{ message, path? }` entries.
- For reusable typed endpoints, use `api.define(method, url, config)` or `api.route(url, config)`
  rather than wrapping calls by hand.

### Cancel requests and apply timeouts

```ts
import faxios, { FaxiosError, isCancel } from "@gcmdev/faxios";

const controller = new AbortController();
const request = faxios.get("https://api.example.com/search", {
  params: { q: "faxios" },
  signal: controller.signal,
  timeout: 3000,
});
controller.abort();

try {
  await request;
}
catch (error) {
  if (isCancel(error)) console.log("canceled");                         // code ERR_CANCELED
  else if (error instanceof FaxiosError && error.code === FaxiosError.ETIMEDOUT) console.log("timed out");
  else throw error;
}
```

- Cancellation uses `AbortSignal` only. faxios checks the signal before middleware, before each
  schema step and right before `fetch`, so an abort during pre-flight work sends nothing.
- A timeout always rejects with `ETIMEDOUT`. `ECONNABORTED` is never raised, and
  `transitional.clarifyTimeoutError` has no effect.

### Handle errors by code

```ts
import faxios, { isFaxiosError } from "@gcmdev/faxios";

try {
  await faxios.get("https://api.example.com/users/404");
}
catch (error) {
  if (!isFaxiosError(error)) throw error;
  switch (error.code) {
    case "ERR_BAD_REQUEST":  console.log("4xx", error.response?.status); break;
    case "ERR_BAD_RESPONSE": console.log("5xx or unparsable JSON"); break;
    case "ERR_NETWORK":      console.log("transport failed", error.cause); break;
    default: throw error;
  }
}
```

- Non-2xx statuses reject because of the default `validateStatus`. Pass your own `validateStatus`
  to change which statuses resolve.
- Transport failures (DNS, refused connection, CORS) reject with `ERR_NETWORK`; the runtime's
  original error is on `error.cause`. `ECONNREFUSED` is not raised as the error's own code.
- `error.toJSON()` never includes the response; list sensitive config keys in `redact` to mask
  them in that output.

### Add behaviour with `.use()` middleware

faxios has no `interceptors`. Middleware wraps each request and runs in registration order on the
way in and in reverse on the way out:

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";

const api = faxios
  .create({ baseURL: "https://api.example.com" })
  .use(async (ctx, next) => {
    ctx.config.headers.set("X-Request-Id", crypto.randomUUID());
    try {
      return await next(ctx);
    }
    catch (error) {
      if (error instanceof FaxiosError && error.response?.status === 401) console.warn("signed out");
      throw error;
    }
  });
```

- Keep the value `.use()` returns; plugins that add options or capabilities type only that value.
- Return without calling `next` to short-circuit, for example from a cache. Each `next(ctx)` call
  dispatches a fresh copy of `ctx.config`, so calling it again retries from the same input.
- `api.eject(sameMiddleware)` removes middleware by identity; requests in flight keep running it.
- `ctx.config.headers` is a `FaxiosHeaders`. Mutate it with `.set()`/`.delete()`; do not assign a
  plain object.
- Per-request scratch data goes on `ctx.state`.

### Use the built-in plugins from their subpaths

```ts
import faxios from "@gcmdev/faxios";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";
import { retry } from "@gcmdev/faxios/plugins/retry";
import { timing } from "@gcmdev/faxios/plugins/timing";

const api = faxios
  .create({ baseURL: "https://api.example.com" })
  .use(timing(event => console.log(event.method, event.url, event.durationMs)))
  .use(retry({ attempts: 3 }))
  .use(authBearer(async () => "token-from-your-store"));

await api.get("/reports", { retry: { attempts: 5 } }); // per-request override
await api.post("/reports", { title: "Q3" });           // POST is not retried by default
await api.get("/health", { retry: false });
```

- `authBearer(getToken, { scheme, header, origins, overwrite })` sends the token only to the
  instance's `baseURL` origin (or only to relative URLs without one). Use `origins` to allow more.
  It leaves an explicit `Authorization` header alone unless `overwrite: true`.
- `retry` defaults: 3 attempts, statuses 408/429/500/502/503/504 plus `ERR_NETWORK` and
  `ETIMEDOUT`, exponential backoff from 100 ms with full jitter, `Retry-After` honoured on 429/503.
  Only GET, HEAD, OPTIONS, PUT, DELETE and QUERY retry; list POST or PATCH in `methods` only when
  the API dedupes repeats. Stream bodies are never replayed. Cancellation never retries.
- `timing(onTiming)` reports `{ method, url, durationMs, status | error }` with no headers or body.
  Install it before `retry` for one event per call, after it for one event per attempt.
- Write your own plugin with `definePlugin` from `@gcmdev/faxios/plugins`; read
  [plugin authoring](references/plugins.md) first.

### Customise the transport through fetch, not adapters

There is no `adapter` option. Supply `fetch` itself to swap the transport, for example in tests or
custom runtimes:

```ts
import faxios from "@gcmdev/faxios";

// Tests or custom runtimes: every request on this instance goes through mockFetch.
const mockFetch: typeof fetch = async () => Response.json({ ok: true });
const testApi = faxios.create({ env: { fetch: mockFetch } });
const { data } = await testApi.get("https://api.example.com/feed"); // { ok: true }

// Real fetch, with extra RequestInit fields for this request.
await faxios.get("https://api.example.com/feed", { fetchOptions: { cache: "no-store" } });
```

- `fetchOptions` is spread into the init object passed to `fetch`. faxios sets `signal`, `method`,
  `headers`, `body`, `duplex` and `credentials` itself, and those override the same keys in
  `fetchOptions`.
- Plain-object values inside `fetchOptions` are copied when configs merge; class instances are
  passed by reference.
- Proxies are runtime configuration, not a faxios option. In Node, the project docs route a
  proxy through `fetchOptions: { dispatcher: new ProxyAgent(url) }` with the project's own
  `undici` dependency (`packages/docs/pages/advanced/fetch-adapter.md`, `MIGRATION_GUIDE.md`).
  faxios passes the instance through to `fetch` but does not test proxying. Browsers, Deno and Bun
  use their platform's proxy settings.

## Import boundaries

| Import | Status |
| --- | --- |
| `@gcmdev/faxios` | Stable: default `faxios`, `Faxios`, `FaxiosError`, `FaxiosHeaders`, `CanceledError`, `isCancel`, `isFaxiosError`, `isSchemaValidationError`, `mergeConfig`, `toFormData`, `formToJSON`, `HttpStatusCode`, `all`, `create`, `VERSION`, and the types |
| `@gcmdev/faxios/plugins` | Stable: `definePlugin` only |
| `@gcmdev/faxios/plugins/auth-bearer`, `/retry`, `/timing` | Stable: one plugin each |
| `@gcmdev/faxios/unsafe/*` | Internal helpers (`buildFullPath`, `buildURL`, `combineURLs`, `isAbsoluteURL`, `utils`). No stability promise; do not use them in application code, and say so if a task seems to need them |

Statics such as `isCancel`, `mergeConfig`, `HttpStatusCode` and `spread` exist on the default
export only. Instances from `create()` do not have them; import them by name instead.

## Common mistakes

1. **HIGH: Using Axios interceptors.** `api.interceptors.request.use(...)` throws because
   `interceptors` is undefined. Use `.use(async (ctx, next) => ...)`. Axios ran request
   interceptors last-registered-first; faxios middleware runs in registration order.
   Source: `packages/tests/unit/api.test.ts`, `src/lib/core/Faxios.ts`.
2. **HIGH: Passing Axios transport options.** `adapter`, `proxy`, `httpAgent`, `httpsAgent`,
   `maxRedirects`, `socketPath`, `decompress` and `cancelToken` are not faxios options. Typed object
   literals reject them, but untyped or spread configs pass and are silently ignored at runtime.
   Use `fetchOptions` or `env.fetch`. Source: `src/lib/types.ts`, `MIGRATION_GUIDE.md`.
3. **HIGH: Using `CancelToken`.** It does not exist. Use `AbortController` and `signal`.
4. **HIGH: Checking for `ECONNABORTED` on timeout.** faxios raises `ETIMEDOUT`. Code that checks
   `ECONNABORTED` never matches. Source: `src/lib/helpers/composeSignals.ts`.
5. **HIGH: Sending an absolute URL through an instance with `baseURL`.** When an instance has a
   `baseURL` and `allowAbsoluteUrls` is unset, faxios appends even an absolute request URL to the
   base: `api.get("https://other.example/x")` requests
   `https://api.example.com/v1/https://other.example/x`. Use a separate instance, or set
   `allowAbsoluteUrls: true` when the absolute URL is trusted. Source:
   `src/lib/core/Faxios.ts` (`resolveAllowAbsoluteUrls`), `src/lib/core/buildFullPath.ts`.
6. **MEDIUM: Importing plugins from the root.** `import { retry } from "@gcmdev/faxios"` fails and
   `faxios.plugins` is undefined. Import from `@gcmdev/faxios/plugins/<name>`.
7. **MEDIUM: Calling statics on an instance.** `api.isCancel(e)` is undefined on a `create()`
   instance. Use the named import.
8. **MEDIUM: Expecting `onUploadProgress` everywhere.** It fires only where `fetch` can stream a
   request body (`duplex: "half"`, for example Node). Browsers generally do not report upload
   progress through fetch; do not promise it there.
9. **MEDIUM: Retrying POST by accident or by assumption.** The retry plugin skips POST and PATCH
   unless they are listed in `methods`; a custom `retryOn` cannot override that.

## Completion

- Every import resolves to an entry in the table above; nothing imports `unsafe/*` in application
  code.
- No `interceptors`, `CancelToken`, `adapter`, `proxy`, `httpAgent` or `ECONNABORTED` remains.
- Type-check the project. A type error on a config key means faxios does not support it; find the
  faxios equivalent above instead of casting it away.
- Exercise one success path and one failure path (an aborted signal or a non-2xx response) and
  confirm the error code matches the handling code.

## References

- When porting an Axios codebase, read [Axios differences](references/axios-differences.md)
  before changing call sites.
- When writing a reusable plugin or typed middleware, read [plugin authoring](references/plugins.md).
