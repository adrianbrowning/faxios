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
  library_version: '0.2.4'
sources:
  - src/index.ts
  - src/lib/faxios.ts
  - src/lib/core/Faxios.ts
  - src/lib/core/headerLayers.ts
  - src/lib/core/mergeConfig.ts
  - src/lib/core/buildFullPath.ts
  - src/lib/core/dispatchRequest.ts
  - src/lib/core/assertRequestConfig.ts
  - src/lib/core/assertSignal.ts
  - src/lib/core/assertTimeout.ts
  - src/lib/core/requestDeadline.ts
  - src/lib/core/resolveRequestURL.ts
  - src/lib/core/FaxiosError.ts
  - src/lib/core/define.ts
  - src/lib/core/route.ts
  - src/lib/types.ts
  - src/lib/adapters/fetch.ts
  - src/lib/helpers/composeSignals.ts
  - src/lib/plugins/definePlugin.ts
  - src/lib/plugins/authBearer.ts
  - src/lib/plugins/forwardTo.ts
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
  The type parameters are `<T, D>` (response data, request body); every method resolves to
  `FaxiosResponse<T, D>`, and there is no third parameter to retype the result.

## Core patterns

### Choose the right call form

- `api(config)`, `api(url, config?)` and `api.request(config)`.
- `get`, `delete`, `head`, `options` take `(url, config?)`.
- `post`, `put`, `patch`, `query` take `(url, data?, config?)`. `query` sends the HTTP QUERY method.
- `postForm`, `putForm`, `patchForm` send `multipart/form-data`.
- `api.getUri(config)` builds the URL from `baseURL`, `url`, `pathParams`, `allowAbsoluteUrls` and
  `params` the way a request does, without sending anything: a `URL` instance `url`, a function
  `paramsSerializer` and the option checks behave as on a request. It doesn't run schemas, so
  `pathParams` fills the `{key}` placeholders as given. With neither `url` nor `baseURL` it
  throws `ERR_INVALID_URL`.

Path and query parameters:

```ts
import faxios from "@gcmdev/faxios";

const res = await faxios.get("https://api.example.com/users/{id}/posts", {
  pathParams: { id: 42 },
  params: { page: 2, tag: "news" },
});
// GET https://api.example.com/users/42/posts?page=2&tag=news
```

`pathParams` values are `encodeURIComponent`-encoded. A missing, `null` or empty (`""`) value, or
`.`/`..` (also percent-encoded, such as `%2e%2e`), rejects with `ERR_BAD_OPTION_VALUE`: an empty
value would turn `/{org}/{repo}` into `//host`.

Binary downloads need `responseType`, and a type argument because `data` is `unknown`:

```ts
import faxios from "@gcmdev/faxios";

const { data } = await faxios.get<ArrayBuffer>("https://example.com/report.zip", {
  responseType: "arraybuffer",
  maxContentLength: 50 * 1024 * 1024, // the body is buffered; cap it for untrusted servers
});
console.log(data.byteLength);
```

Unset `responseType` reads the body as text, then JSON-parses it if it parses, else keeps the raw
string. `"json"` is strict: a 2xx body that isn't JSON rejects with `ERR_BAD_RESPONSE`. A 4xx/5xx
body that isn't JSON keeps the status error (`Request failed with status code N`), with the raw
body on `error.response.data` and the parse error on `error.cause`. `"text"` skips the
JSON parse; `"blob"`, `"formdata"` and `"stream"` (a `ReadableStream`) are also supported.

### Merge defaults the way faxios does

`faxios.create(config)` merges `config` over the parent's defaults with `mergeConfig`:

- `url`, `method` and `data` never inherit; they come from the request only.
- `headers` merge case-insensitively. Group headers by method with `common`, `get`, `post`,
  etc. A group is an object; a string under a group name (a header literally named `get`) is a
  plain header. Precedence, lowest first: instance `common`, instance method group, instance
  flat keys, request `common`, request method group, request flat keys. So any request header
  beats any instance header, and within one level flat keys win over groups. A `create()` child
  layers over its parent the same way: any child header, `common` included, beats every parent
  header, and a child method group applies to that method only. `headers` may also be a
  `Headers`, a `Map` or `[name, value]` pairs, on every method alias and on `create()`: it is
  one flat layer, and a child given one still inherits the parent's groups. Header
  values must be strings, numbers, string arrays, booleans, `null` or `undefined`; convert
  anything else with `String(...)`.
- Arrays such as `transformRequest` and `transformResponse` are replaced, not concatenated.
- An explicit `undefined` in the request counts as unset: the inherited `baseURL`, `timeout`,
  schema or `validateStatus` still applies, on `request()` and every method alias alike. Only
  `xsrfCookieName` and `xsrfHeaderName` are cleared by `undefined`. Use `validateStatus: null` to
  resolve every status.
- `params` and `env` merge one level deep: their own keys combine, and a nested value (such as
  `params: { filter: { … } }`) is replaced, not merged. `auth` and other plain objects deep-merge.
- Middleware added with `.use()` is not copied into `create()` children, and neither are the
  parent's defaults for plugin options. Register the plugin on each instance that needs it.

To remove an inherited header for one request, set it to `undefined`. To keep a header off the
wire entirely, including ones faxios adds itself, set it to `null` or `false`.

### Validate and type responses with a schema

Any Standard Schema v1 library works (Zod, Valibot, ArkType). Passing `responseSchema` types
`response.data` as the schema's output:

```ts expect=error:ERR_BAD_RESPONSE_SCHEMA
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
  `ERR_BAD_RESPONSE_SCHEMA`. `error.issues` holds `{ message, path? }` entries. On
  `ERR_BAD_RESPONSE_SCHEMA`, `error.response.data` is the body the schema rejected. Schemas run
  inside dispatch, so middleware sees the unvalidated config before `next(ctx)`.
- For reusable typed endpoints, use `api.define(method, url, config)` or `api.route(url, config)`
  rather than wrapping calls by hand. They return plain functions with no `.use()`
  (`api.define(...).use(...)` is a TypeError), so put middleware on the instance and call
  `define()`/`route()` on the value `.use()` returned. Middleware added later still runs (the
  endpoint calls `api.request()` each time), but only that value types plugin options.
  `pathParams` is required when `pathParamsSchema` is set and optional otherwise. A `route()` method config merges
  over the route config like any other config, so headers combine.

```ts check=types
import faxios from "@gcmdev/faxios";
import { z } from "zod";

const api = faxios
  .create({ baseURL: "https://api.example.com" })
  .use(async (ctx, next) => next(ctx));
const getUser = api.define("get", "/users/{id}", {
  pathParamsSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ name: z.string() }),
});
const { data } = await getUser({ pathParams: { id: "123" } });
console.log(data.name);
```

- With a plugin such as `retry()`, see "Define endpoints on a plugin instance" in
  [references/plugins.md](references/plugins.md).

### Cancel requests and apply timeouts

```ts expect=log:canceled
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
  schema step and right before `fetch`, so an abort during pre-flight work sends nothing. An
  abort rejects at once, even while a middleware or an async schema is still running.
- `signal` must have `aborted`, `addEventListener` and `removeEventListener` (a polyfilled or
  other-realm `AbortSignal` works). Anything else rejects with `ERR_BAD_OPTION_VALUE` before
  middleware runs. One long-lived signal can serve many requests: faxios removes its listeners
  from the signal once each request settles.
- `controller.abort(reason)` keeps the reason: an `Error` becomes the `CanceledError`'s `cause`
  and message, a string becomes the message, at every stage.
- A timeout always rejects with `ETIMEDOUT`. `ECONNABORTED` is never raised, and
  `transitional.clarifyTimeoutError` has no effect. `timeout` must be 0 to 2147483647 ms;
  anything else (`-1`, `NaN`, `Infinity`, `2 ** 31`) rejects with `ERR_BAD_OPTION_VALUE`.
- `timeout` bounds the whole request: it starts before middleware and covers middleware,
  schemas, every `retry` try and wait, and the fetch. It is not per try (unlike Axios), and a
  timed-out request is not retried. For a per-try limit use `retry({ attemptTimeout })`.
  Changing `ctx.config.timeout` in middleware has no effect.
- With `responseType: "stream"`, `timeout` and `signal` stay active until the body is fully
  read or cancelled, also behind `retry({ attemptTimeout })`, whose per-try limit stops when the
  response arrives. Reading a stalled body rejects with `ETIMEDOUT` or `ERR_CANCELED`.
  A status error (`ERR_BAD_REQUEST` for a 404) carries the open body on `error.response.data`;
  read it for the server's error details. Cancel a body you don't read so the timer and signal
  listener are released.

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
- Transport failures (DNS, refused connection, CORS, a body that fails mid-read) reject with
  `ERR_NETWORK` and a message naming the reason and request
  (`Network Error: ECONNREFUSED (GET https://host/path)`); the runtime's original error is on
  `error.cause`. `ECONNREFUSED` is not raised as the error's own code. A URL `fetch` can't parse
  (outside the browser, a relative `url` with no `baseURL`) rejects with `ERR_INVALID_URL`; a bad
  `method` (including `""`, `0` or `false`; only `undefined`/`null` mean the default), a `url` that
  isn't a string or `URL`, or a non-object config rejects with `ERR_BAD_OPTION_VALUE`. An unknown
  `paramsSerializer` or `formSerializer` key rejects with `ERR_BAD_OPTION`; a `maxDepth` that isn't a
  non-negative integer or `Infinity` rejects with `ERR_BAD_OPTION_VALUE`.
- `error.name` is always `"FaxiosError"`; branch on `error.code`, and read a wrapped error's own
  name (`TypeError`, `SyntaxError`) from `error.cause`.
- `error.toJSON()` never includes the response, masks `authorization`, `proxy-authorization`,
  `cookie` and `auth` at any depth and strips `user:pass@` from `url`/`baseURL`; list other
  sensitive config keys in `redact` to mask them too. A request's `redact` adds to the
  instance's. `config.data` is the body the caller passed (an object, not the JSON or form string
  sent), so `redact: ["password"]` masks a body password; a pre-serialized string body is logged
  as is. Schema `issues` keep only `message` and each path segment's `key`. Its `cause` is the
  wrapped error chain as `{ name, code, message, cause }`. Log `error.toJSON()`, not `error`: the
  error object still holds the full config.

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
- `ctx.config.headers` is a `FaxiosHeaders`. Mutate it with `.set()`/`.delete()`, or assign
  another `FaxiosHeaders`; never assign a plain object.
- `ctx.config.method` is always lower-case in middleware: compare with `"post"`, not `"POST"`.
- Per-request scratch data goes on `ctx.state`. `ctx.attempt` is the try number (1 unless a
  retry middleware sets it); a hand-written retry loop sets `ctx.attempt` before each `next(ctx)`.
- To change a context field for the rest of the chain, pass a spread copy:
  `next({ ...ctx, config })` or `next({ ...ctx, state: { ...ctx.state } })`. The spread carries
  what core keeps on the context, such as the stream body that `timeout` still governs after the
  response; a context rebuilt from its fields keeps that only with the same `ctx.state` object.

### Use the built-in plugins from their subpaths

Each built-in plugin has its own subpath and is not exported from the root:
`authBearer` from `@gcmdev/faxios/plugins/auth-bearer`, `forwardTo` from
`@gcmdev/faxios/plugins/forward-to`, `retry` from `@gcmdev/faxios/plugins/retry`, `timing` from
`@gcmdev/faxios/plugins/timing`. Install them with `.use()` on the instance and keep the returned
value, because it is the only value typed with the plugin's request options (such as
`retry: false`). Before writing plugin code, read
[plugins](references/plugins.md) for a complete installation example.

- `authBearer(getToken, { scheme, header, origins, overwrite })` sends the token only to the
  instance `baseURL` origin when that is absolute; otherwise only to relative request URLs. A
  per-request `baseURL` never gets it, nor does a URL with a `pathParams` placeholder in its
  scheme or host (`"https://{host}/x"`). Use
  `origins` to allow more. It leaves an explicit `Authorization` header alone unless
  `overwrite: true`. Install `retry` before it if each attempt should call `getToken` again.
  A `getToken` result that isn't a non-empty string sends the request without the header.
  With a custom `header`, it sets `fetchOptions.redirect: "error"` unless the request sets
  `redirect`, because fetch strips only `Authorization` on a cross-origin redirect.
- `forwardTo(gateway, { header })` sends each request to `gateway` (absolute http/https URL)
  with the final target URL (`baseURL`, `pathParams`, validated `params` applied) in
  `X-Forward-To` or `header`. It wraps `env.fetch` (or the global fetch); never rewrite `url` in
  middleware to reach a gateway, since path params and `params` are applied after middleware.
  Every `retry` try is forwarded, wherever `retry` is installed. Middleware, `authBearer`'s
  origin rule and `timing` see the target URL, not the gateway. `forward: false` on a request
  sends it directly; `forward` accepts only `false`.
- `retry` defaults: 3 attempts, statuses 408/429/500/502/503/504 plus `ERR_NETWORK` and
  `ETIMEDOUT`, exponential backoff from 100 ms with full jitter. A 429/503 `Retry-After` sets the
  wait unless `respectRetryAfter: false`. Turn that off when something else, such as a queue
  throttle, already honours `Retry-After`. `attemptTimeout` (ms, default 0 = none) aborts one try
  that runs too long and retries it; the request's `timeout` still caps all tries together.
  Only GET, HEAD, OPTIONS, PUT, DELETE and QUERY retry; list POST or PATCH in `methods` only when
  the API dedupes repeats. Stream bodies are never replayed. Cancellation never retries. A custom
  `retryOn` replaces the whole default predicate (`statuses`, `ERR_NETWORK`, `ETIMEDOUT`), and a
  `Retry-After` longer than `maxRetryAfter` (default 5 min) rejects without retrying.
  `maxDelay` and `maxRetryAfter` are capped at 2147483647 ms and `attempts` at 10, in the plugin
  and per request alike (`ERR_BAD_OPTION_VALUE` above).
- `timing(onTiming)` reports `{ method, url, attempt, durationMs, status | error }` with no
  config, headers or body; `error` is `{ code, message, status }`, and `url` has no user info or
  query string and keeps `{param}` placeholders. `attempt` is `ctx.attempt`: 1 without `retry`.
  Install it before `retry` for one event per call, after it for one event per attempt.
- To write your own plugin, use `definePlugin` from `@gcmdev/faxios/plugins`. The built-in plugins
  use only what `@gcmdev/faxios` and `@gcmdev/faxios/plugins` export, so yours can do what they do. The same
  [plugins](references/plugins.md) reference covers authoring.

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

- Every own enumerable key of `fetchOptions` is copied into a null-prototype init passed to
  `fetch`, including runtime extensions (Next.js `next`, Workers `cf`, undici `dispatcher`).
  Inherited keys are ignored. faxios sets `signal`, `method`, `headers`, `body`, `duplex` and
  `credentials` itself and ignores those keys in `fetchOptions`.
- `fetch` gets `(request, init)`: one `Request` built from that init, and an init that repeats
  the Request's members with an own `body` that adds no new body (`null` in Node and Deno,
  `undefined` in Bun, probed once). A custom `env.fetch` reads the body from the Request
  (`await input.text()`), not `init.body`; only with `env.Request: null` is it
  `fetch(url, init)` with the body in `init.body`. `init.headers` is the Request's `Headers`
  object (use `.get(name)`, not `init.headers[name]`), and `init.duplex` is `"half"` only for a
  stream body.
- `withCredentials: true` becomes fetch `credentials: "include"`; `false` or unset becomes
  `"same-origin"`, so same-origin requests still send cookies. A string passes through unchanged.
- In the browser, when faxios sets the XSRF header and the request sets no `redirect`, it uses
  `fetchOptions.redirect: "error"`, because fetch strips only `Authorization` on a cross-origin
  redirect. Set `fetchOptions: { redirect: "follow" }` only for redirects you trust.
- `env.fetch`, `env.Request` and `env.Response` count only as own properties of `env`.
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
| `@gcmdev/faxios` | Stable: default `faxios`, `Faxios`, `FaxiosError`, `FaxiosHeaders`, `CanceledError`, `isCancel`, `isFaxiosError`, `isSchemaValidationError`, `mergeConfig`, `toFormData`, `formToJSON`, `HttpStatusCode`, `resolveRequestURL`, `all`, `create`, `VERSION`, and the types |
| `@gcmdev/faxios/plugins` | Stable: `definePlugin` only |
| `@gcmdev/faxios/plugins/auth-bearer`, `/forward-to`, `/retry`, `/timing` | Stable: one plugin each |
| `@gcmdev/faxios/unsafe/*` | Internal helpers (`buildFullPath`, `buildURL`, `combineURLs`, `isAbsoluteURL`). No stability promise; do not use them in application code, and say so if a task seems to need them |

Use `faxios.create()` for instances. An instance made with `new Faxios()` has no `use()` or
`eject()`.

Statics such as `isCancel`, `mergeConfig` and `HttpStatusCode` exist on the default
export only. Instances from `create()` do not have them; import them by name instead.

## Common mistakes

1. **HIGH: Using Axios interceptors.** `api.interceptors.request.use(...)` throws because
   `interceptors` is undefined. Use `.use(async (ctx, next) => ...)`. Axios ran request
   interceptors last-registered-first; faxios middleware runs in registration order.
   Source: `packages/tests/unit/api.test.ts`, `src/lib/core/Faxios.ts`.
2. **HIGH: Passing Axios transport options.** `adapter`, `proxy`, `httpAgent`, `httpsAgent`,
   `maxRedirects`, `socketPath`, `decompress` and `cancelToken` are not faxios options. Typed object
   literals reject them, and at runtime any unknown config key (including a typo such as
   `timout`) rejects the request with `ERR_BAD_OPTION`, naming the key and, for removed options,
   what to use instead. Use `fetchOptions` or `env.fetch`. Source:
   `src/lib/core/assertRequestConfig.ts`, `MIGRATION_GUIDE.md`.
3. **HIGH: Using `CancelToken`.** It does not exist. Use `AbortController` and `signal`.
4. **HIGH: Checking for `ECONNABORTED` on timeout.** faxios raises `ETIMEDOUT`. Code that checks
   `ECONNABORTED` never matches. Source: `src/lib/core/requestDeadline.ts`.
5. **HIGH: Sending an absolute URL through an instance with `baseURL`.** When an instance has a
   `baseURL` and `allowAbsoluteUrls` is unset, an absolute request URL rejects with
   `ERR_INVALID_URL` before fetch: `api.get("https://other.example/x")` fails, and so does
   `api.getUri({ url: "https://other.example/x" })`. Use a separate instance, or set
   `allowAbsoluteUrls: true` when the absolute URL is trusted. A URL is absolute only with a
   scheme and `//`: `documents:batchGet` or `localhost:3000/x` joins `baseURL`. A `url` or
   joined `baseURL` with a tab or line break rejects with `ERR_INVALID_URL`. Source:
   `src/lib/core/Faxios.ts` (`resolveAllowAbsoluteUrls`), `src/lib/core/resolveRequestURL.ts`,
   `src/lib/core/buildFullPath.ts`, `src/lib/helpers/isAbsoluteURL.ts`.
6. **MEDIUM: Importing plugins from the root.** `import { retry } from "@gcmdev/faxios"` fails and
   `faxios.plugins` is undefined. Import from `@gcmdev/faxios/plugins/<name>`.
7. **MEDIUM: Calling statics on an instance.** `api.isCancel(e)` is undefined on a `create()`
   instance. Use the named import.
8. **MEDIUM: Expecting `onUploadProgress` everywhere.** It fires only where faxios streams the
   request body: Node. Deno and Bun can send a stream body, but their `Request` doesn't read the
   `duplex` option faxios checks for, so it isn't called there. In browsers and web workers faxios
   never streams the body for progress, so the callback is not called; do not promise it there.
   Source: `src/lib/adapters/fetch.ts` (`supportsRequestStream`, `isBrowserRuntime`).
9. **MEDIUM: Retrying POST by accident or by assumption.** The retry plugin skips POST and PATCH
   unless they are listed in `methods`; a custom `retryOn` cannot override that.
10. **MEDIUM: Downloading a binary body without `responseType`.** The bytes are decoded as UTF-8
    text and come back corrupted. Set `responseType: "arraybuffer"` and type the call with
    `get<ArrayBuffer>`. Source: `src/lib/adapters/fetch.ts`.

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
- When installing `authBearer`, `forwardTo`, `retry` or `timing`, or writing a reusable plugin or typed
  middleware, read [plugins](references/plugins.md).
