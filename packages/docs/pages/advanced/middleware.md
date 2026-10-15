# Middleware and plugins

`use()` is how you hook into the request lifecycle. You pass it a middleware function, or a plugin that wraps one, and it runs around every request the instance sends.

A middleware is an `async (ctx, next) => response` function. Code before `await next(ctx)` runs on the way in, and code after it runs on the way out:

```ts
import faxios from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  ctx.config.headers.set("X-Client", "docs-example");
  const response = await next(ctx);
  console.log(response.status);
  return response;
});

await api.get("/users");
```

Middleware replaces interceptors, which faxios no longer has. If you're moving code over, see [Migrating from interceptors](/pages/advanced/migrating-from-interceptors).

## Ordering

Middleware runs in registration order on the way in and in reverse order on the way out. With `a` installed before `b`:

```text
request  ──▶ a before ──▶ b before ──▶ dispatch ──┐
                                                  │  fetch
response ◀── a after  ◀── b after  ◀──────────────┘
```

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosMiddleware } from "@gcmdev/faxios";

const steps: Array<string> = [];

const log = (name: string): FaxiosMiddleware => async (ctx, next) => {
  steps.push(`${name} before`);
  const response = await next(ctx);
  steps.push(`${name} after`);
  return response;
};

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(log("a"))
  .use(log("b"));

await api.get("/users");
console.log(steps); // ["a before", "b before", "b after", "a after"]
```

Dispatch is everything faxios does to send one request: the schema checks, `transformRequest`, the `fetch` call, `transformResponse` and `responseSchema` validation.

## `use()` returns the instance

`use()` returns the instance it was called on, so calls chain. At runtime it is the same object: `api.use(plugin)` installs the plugin on `api` whether or not you keep the result. The returned value has a new type, though. Only that value knows the request options and capabilities the plugin adds, so keep it and make your requests through it:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const base = faxios.create({ baseURL: "https://api.example.com" });
const api = base.use(retry());

await api.get("/users", { retry: { attempts: 5 } });

// retry() runs for base's requests too, since base and api are the same object,
// but only api's type has the `retry` option.
// @ts-expect-error TS2769 -- base's type doesn't know the retry option
await base.get("/users", { retry: false });
```

The usual pattern is to create, install and export the instance in one expression:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";
import { timing } from "@gcmdev/faxios/plugins/timing";

export const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(timing(event => console.log(event)))
  .use(retry());
```

`use()` and `eject()` exist on the default export and on instances from `faxios.create()`. `new Faxios()` has neither. Middleware on the default export runs for every request any module sends through it, so prefer an instance.

`create()` children start with no middleware and no plugin types, even when you call `create()` on an instance that has plugins installed. Install the plugins again on the child:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry());

// Inherits api's config, but not its middleware or the `retry` option.
const slowApi = api.create({ timeout: 60_000 }).use(retry({ attempts: 2 }));

await slowApi.get("/reports", { retry: false });
```

Because the child has none of the parent's plugins, `create()` leaves out every default the parent's plugins declared as a request option: with `api.defaults.retry = { attempts: 5 }`, the child above gets no `retry` default. Set it again on the child after installing the plugin. `eject()` works the same way: it removes the defaults for the options the ejected plugin declared, unless another installed plugin declares the same option. Without this, every request would reject with `ERR_BAD_OPTION` (`Unknown option retry`).

## The context

Every request gets a fresh `ctx`, built after the request config has been merged with the instance defaults.

- `ctx.config` is the merged request config. `ctx.config.headers` is a `FaxiosHeaders`, so `.set()`, `.has()` and `.delete()` work before you call `next`. You can also assign a new `FaxiosHeaders` to it, but not a plain object.
- `ctx.state` is a null-prototype object for this request only. Middleware can use it to pass values to each other.
- `ctx.capabilities` holds the values plugins [provide](#capabilities). It is shared by every request of the instance.
- `ctx.attempt` is the try the context leads to, counting from 1. It starts at 1 for every request; [`retry`](#retry) sets it before each try, and a retry middleware of your own [can too](#calling-next-again-retries).
- `ctx.instanceBaseURL` is the instance's own `baseURL`, or `undefined` when it has none. A per-request `baseURL` changes `ctx.config.baseURL` but not this, so a plugin can tell the API the instance was made for from a request's override.

```ts
import faxios from "@gcmdev/faxios";

const REQUEST_ID = Symbol("requestId");

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(async (ctx, next) => {
    const id = crypto.randomUUID();
    ctx.state[REQUEST_ID] = id;
    ctx.config.headers.set("X-Request-Id", id);
    return next(ctx);
  })
  .use(async (ctx, next) => {
    try {
      return await next(ctx);
    } catch (err) {
      console.error(`request ${String(ctx.state[REQUEST_ID])} failed`);
      throw err;
    }
  });

await api.get("/users");
```

For bearer tokens, use the built-in [`authBearer`](#authbearer) plugin rather than setting `Authorization` yourself: it only sends the token to your API's origin.

## How `next` works

### Each call dispatches a copy

`next(ctx)` runs the rest of the chain and then dispatches a copy of `ctx.config`. Changes dispatch makes, such as `transformRequest` output and schema output, go to the copy and never show up on `ctx.config`. Dispatch fills in path params only in the URL it sends, so `ctx.config.url` keeps the template:

```ts
import faxios from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  const response = await next(ctx);
  console.log(ctx.config.url); // "/users/{id}": dispatch fills in path params only in the URL it sends
  return response;
});

await api.get("/users/{id}", { pathParams: { id: "7" } });
```

### Calling `next` again retries

Because every call starts from the same input, calling `next` again sends the request again. This middleware retries network errors up to two more times, and sets `ctx.attempt` before each try so middleware after it, such as [`timing`](#timing), knows which try it is on:

```ts
import faxios, { FaxiosError, isFaxiosError } from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  for (let attempt = 1; ; attempt++) {
    ctx.attempt = attempt;
    try {
      return await next(ctx);
    } catch (err) {
      if (attempt === 3 || !isFaxiosError(err) || err.code !== FaxiosError.ERR_NETWORK) throw err;
    }
  }
});

await api.get("/users");
```

Set `ctx.attempt` on the context you pass to `next`. Middleware installed before yours reads the same object, so after `next` settles it sees the last try's number, unless a middleware between you passes `next` a copy of the context.

For real use, install the built-in [`retry`](#retry) plugin, which adds backoff, `Retry-After` support and a per-request option.

Calling `next` again is safe when the body can be read again, such as a string, an object, a `Blob` or `FormData`. A stream body is used up by the first try, so sending it again rejects with a `FaxiosError` whose code is `ERR_BAD_REQUEST`.

### Error statuses arrive as rejections

`validateStatus` rejects non-2xx responses by default, so middleware sees a 404 or 500 as a rejected `FaxiosError`, not as a response. Catch it around `next`; the response is on `err.response`. This middleware turns a 404 back into a response:

```ts status=404
import faxios, { isFaxiosError } from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  try {
    return await next(ctx);
  } catch (err) {
    if (isFaxiosError(err) && err.response?.status === 404) return err.response;
    throw err;
  }
});

const { status } = await api.get("/users/7");
console.log(status); // 404
```

### Refreshing a token after a 401

This plugin refreshes the token once after a 401 and retries. Install it before [`authBearer`](#authbearer). It never sets `Authorization` itself: `authBearer` runs again inside the second `next`, calls `getToken` again and applies its origin rule, so a 401 from a third-party URL is retried without your token. All 401s wait for one shared refresh, because with rotating refresh tokens a second refresh sends a token the first one already spent.

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";

function refreshOn401(refresh: () => Promise<void>) {
  let refreshing: Promise<void> | undefined;
  return definePlugin({
    name: "refreshOn401",
    middleware: async (ctx, next) => {
      try {
        return await next(ctx);
      }
      catch (err) {
        if (!(err instanceof FaxiosError) || err.response?.status !== 401) throw err;
        refreshing ??= refresh().finally(() => {
          refreshing = undefined;
        });
        await refreshing;
        return next(ctx);
      }
    },
  });
}

let token = "expired";
const refreshToken = async () => {
  token = "fresh";
};

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(refreshOn401(refreshToken))
  .use(authBearer(() => token));

await api.get("/me");
```

### Returning without `next` skips the request

A middleware must resolve to a response. One that awaits `next(ctx)` but forgets to return the result rejects with a `FaxiosError` with code `ERR_BAD_RESPONSE`, so the middleware outside it never sees `undefined`.

A middleware that returns a response without calling `next` sends nothing. Dispatch doesn't run at all, so neither do the schema checks. The [`cache()` example](#typed-request-options) below works this way.

### Cancellation

Aborting the request's `signal` at any point before the request is sent rejects with `CanceledError` and sends nothing, even while a middleware is awaiting something before it calls `next`. An already-aborted request runs no middleware.

[`timeout`](/pages/advanced/request-config#timeout) covers middleware too. The deadline starts before the first middleware runs, so a middleware that never resumes still rejects with `ETIMEDOUT` once it passes. While the deadline runs, `ctx.config.signal` is the request's signal, which aborts at the deadline as well as when the caller aborts; pass it on to any work of your own that should stop with the request. Setting `ctx.config.timeout` in middleware doesn't change the deadline.

## `eject()`

`eject()` removes middleware or a plugin by reference, so pass it the same function or plugin object you gave `use()`:

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosMiddleware } from "@gcmdev/faxios";

const logger: FaxiosMiddleware = async (ctx, next) => {
  console.log(ctx.config.method, ctx.config.url);
  return next(ctx);
};

const api = faxios.create({ baseURL: "https://api.example.com" }).use(logger);
await api.get("/users"); // logged

api.eject(logger);
await api.get("/users"); // not logged
```

Requests that are already running keep the middleware and capabilities they started with. Ejecting a plugin frees the capabilities it provided, so another plugin can provide them. The instance type doesn't change: request options the plugin added stay in the type.

## Writing a plugin

A plugin is middleware with a name, plus optional capabilities it provides to other plugins. Build one with `definePlugin`, the only export of `@gcmdev/faxios/plugins`. The built-in plugins import only `@gcmdev/faxios` and `@gcmdev/faxios/plugins`, so a plugin of your own can do anything they do:

```ts
import faxios from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";

const requestId = () => definePlugin({
  name: "requestId",
  middleware: async (ctx, next) => {
    ctx.config.headers.set("X-Request-Id", crypto.randomUUID());
    return next(ctx);
  },
});

const api = faxios.create({ baseURL: "https://api.example.com" }).use(requestId());
await api.get("/users");
```

`definePlugin({ name, provides?, options?, middleware })` returns the object it was given, so `eject()` takes the same reference. What it adds is the plugin's type, which it infers from the object:

- `provides` comes from the `provides` value.
- The request options and required capabilities come from the middleware's context annotation, `ctx: FaxiosContext<Options, Capabilities>`. Use `unknown` for `Options` when the plugin adds no options. A plugin with request options also names them at runtime in `options` (see [Typed request options](#typed-request-options)).
- Capabilities the plugin provides itself can be in that annotation; they don't count as required.
- A `provides` value whose type contradicts the annotation is a type error.
- Middleware without an annotation still sees the plugin's own `provides` on `ctx.capabilities`.

To see the URL a request goes to, import `resolveRequestURL(config)` from `@gcmdev/faxios`. It is the resolver core uses for the request and for `getUri()`: `url` with `pathParams` filled in, joined to `baseURL` (honouring `allowAbsoluteUrls`), then `params`. A URL is absolute only when a scheme is followed by `//`, so `documents:batchGet` joins `baseURL`. It throws the `FaxiosError` the request would reject with: `ERR_INVALID_URL` for an absolute URL that `allowAbsoluteUrls: false` refuses, `ERR_BAD_OPTION_VALUE` for a placeholder `pathParams` can't fill. In middleware, schemas haven't run yet, so it uses `pathParams` and `params` as the caller gave them. To check only the origin, as `authBearer` does, pass `{ ...ctx.config, pathParams: undefined, params: undefined }`: a `pathParamsSchema` may fill or rename placeholders the raw `pathParams` can't, and path params never move the origin.

```ts
import faxios, { resolveRequestURL } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";

const logURL = () => definePlugin({
  name: "logURL",
  middleware: async (ctx, next) => {
    console.log(resolveRequestURL(ctx.config)); // "https://api.example.com/users/7?q=1"
    return next(ctx);
  },
});

const api = faxios.create({ baseURL: "https://api.example.com" }).use(logURL());
await api.get("/users/{id}", { pathParams: { id: 7 }, params: { q: 1 } });
```

### Typing a plugin factory

Annotate a factory's return type with `FaxiosPlugin<{ requires?; provides?; options? }>`. This is how the built-in plugins are declared, and it keeps the plugin's public type readable:

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosPlugin } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";

export function slowRequestWarning(thresholdMs: number): FaxiosPlugin {
  return definePlugin({
    name: "slowRequestWarning",
    middleware: async (ctx, next) => {
      const start = performance.now();
      try {
        return await next(ctx);
      } finally {
        const ms = performance.now() - start;
        if (ms > thresholdMs) console.warn(`${ctx.config.url} took ${Math.round(ms)}ms`);
      }
    },
  });
}

const api = faxios.create({ baseURL: "https://api.example.com" }).use(slowRequestWarning(500));
await api.get("/users");
```

Each slot is optional:

| Slot | What it does |
| --- | --- |
| `requires` | Capabilities that must be installed before this plugin. Installing it earlier is a type error. |
| `provides` | Capabilities this plugin adds to `ctx.capabilities`. Declaring it makes the `provides` value required. |
| `options` | Request options this plugin adds to every config-taking member of the instance. They must be optional. Declaring it makes the plugin's `options` value required: an object that maps each option name to `true`, such as `{ cache: true }`. |

A slot you leave out adds nothing. An unknown key, such as `require`, is a type error rather than being ignored. The emitted types also carry a `"~plugin"` property; it is an internal marker, so never set or read it.

## Typed request options

A plugin adds request options by annotating its middleware's context with them and listing their names in `options`. faxios rejects every request config key that is neither a faxios option nor named by an installed plugin's `options`, so a plugin that leaves a name out makes requests carrying that option reject with `ERR_BAD_OPTION`. `definePlugin` and `FaxiosPlugin` make `options` required, with every option named, whenever the context declares request options. This `cache()` plugin adds a `cache` option and answers repeated `GET` requests from memory without calling `next`:

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosContext, FaxiosPlugin, FaxiosResponse } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";

export type CacheOptions = { cache?: { ttlMs?: number } | false };

export function cache(defaultTtlMs = 60_000): FaxiosPlugin<{ options: CacheOptions }> {
  const store = new Map<string, { expires: number; response: FaxiosResponse }>();
  return definePlugin({
    name: "cache",
    options: { cache: true },
    middleware: async (ctx: FaxiosContext<CacheOptions>, next) => {
      const option = ctx.config.cache;
      if (option === false || ctx.config.method !== "get") return next(ctx);

      const { baseURL, url, params } = ctx.config;
      const key = JSON.stringify([baseURL, url, params instanceof URLSearchParams ? String(params) : params]);
      const hit = store.get(key);
      // Returning without next(): nothing is sent.
      if (hit && hit.expires > Date.now()) return hit.response;

      const response = await next(ctx);
      store.set(key, { expires: Date.now() + (option?.ttlMs ?? defaultTtlMs), response });
      return response;
    },
  });
}

const api = faxios.create({ baseURL: "https://api.example.com" }).use(cache());

await api.get("/users", { cache: { ttlMs: 5_000 } });
await api.get("/users"); // answered from the cache
await api.get("/users", { cache: false }); // always sent

// The option is typed on every config-taking member, including defaults, define() and route().
api.defaults.cache = { ttlMs: 30_000 };
const listUsers = api.define("get", "/users", { cache: false });
const user = api.route("/users/{id}", { cache: { ttlMs: 1_000 } });

// @ts-expect-error TS2769 -- ttlMs must be a number
await api.get("/users", { cache: { ttlMs: "5s" } });
```

`ctx.config.method` is always lower-case in middleware, because faxios normalizes it during the merge.

On an instance without `cache()`, `{ cache: { ttlMs: 5_000 } }` is a type error. TypeScript only checks excess properties on object literals, though, so a config held in a variable can still carry it. At runtime that request rejects with `ERR_BAD_OPTION` (`Unknown option cache`), because only installed plugins add accepted request options.

## Capabilities

A capability is a value one plugin provides for plugins installed after it. The built-in `authBearer` plugin provides `auth`, whose `getToken()` returns the current token. A plugin that stops a request before it is sent when nobody is signed in requires it:

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosContext } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";
import type { AuthBearerCapability } from "@gcmdev/faxios/plugins/auth-bearer";

function requireSignIn() {
  return definePlugin({
    name: "requireSignIn",
    middleware: async (ctx: FaxiosContext<unknown, AuthBearerCapability>, next) => {
      if (!(await ctx.capabilities.auth.getToken())) throw new Error("Sign in first");
      return next(ctx);
    },
  });
}

let token = "my-token";

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(authBearer(() => token))
  .use(requireSignIn());

await api.get("/me");

// @ts-expect-error TS2345 -- requireSignIn requires the auth capability, which nothing installed provides
faxios.create({ baseURL: "https://api.example.com" }).use(requireSignIn()).use(authBearer(() => token));
```

Installing `requireSignIn` before `authBearer` fails to compile. The error names the missing capability:

```text
Property '"faxios: install a plugin that provides this capability first"' is missing in type
'FaxiosPluginBase<AuthBearerCapability, unknown, unknown> & { provides?: unknown; }' but required in type
'{ "faxios: install a plugin that provides this capability first": "auth"; }'.
```

The same error appears when an installed plugin provides `auth` with an incompatible shape.

A plugin can provide one capability and require another in a single context annotation. This cache keys responses by the current user's token, so one user never gets another's cached data, and provides `cache` so later middleware can clear it:

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosContext, FaxiosResponse } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";
import type { AuthBearerCapability } from "@gcmdev/faxios/plugins/auth-bearer";

type CacheCapability = { cache: { clear: () => void } };

function userCache() {
  const store = new Map<string, FaxiosResponse>();
  return definePlugin({
    name: "userCache",
    provides: { cache: { clear: () => store.clear() } },
    middleware: async (ctx: FaxiosContext<unknown, AuthBearerCapability & CacheCapability>, next) => {
      if (ctx.config.method !== "get") return next(ctx);
      const key = `${await ctx.capabilities.auth.getToken()} ${ctx.config.url ?? ""}`;
      const hit = store.get(key);
      if (hit) return hit;
      const response = await next(ctx);
      store.set(key, response);
      return response;
    },
  });
}

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(authBearer(() => "my-token"))
  .use(userCache())
  .use(async (ctx, next) => {
    // Any write may change what the cached GETs would return.
    if (ctx.config.method !== "get") ctx.capabilities.cache.clear();
    return next(ctx);
  });

await api.get("/me");
await api.post("/me/settings", { theme: "dark" });
```

`userCache()` requires `auth`, which `authBearer` provides, but not `cache`, which it provides itself.

Two plugins can't provide the same capability on one instance. Installing the second is a type error ("faxios: another installed plugin already provides this capability"), and at runtime `use()` throws a `FaxiosError` with code `ERR_BAD_OPTION`.

## Built-in plugins

faxios ships four plugins. Each one has its own entry point, which exports the plugin and its types. Neither the package root nor `@gcmdev/faxios/plugins` re-exports them, and there is no `faxios.plugins` property.

| Plugin | Import | Adds |
| --- | --- | --- |
| [`authBearer`](#authbearer) | `import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer"` | the `auth` capability |
| [`forwardTo`](#forwardto) | `import { forwardTo } from "@gcmdev/faxios/plugins/forward-to"` | the `forward` request option |
| [`retry`](#retry) | `import { retry } from "@gcmdev/faxios/plugins/retry"` | the `retry` request option |
| [`timing`](#timing) | `import { timing } from "@gcmdev/faxios/plugins/timing"` | nothing |

### `authBearer`

`authBearer(getToken, options?)` sets `Authorization: Bearer <token>` on requests to your API, calling `getToken` (which may return a string or a promise) on each of them. A header the request already has is kept unless you pass `overwrite: true`. By default the token goes only to the origin of the instance `baseURL` when that is absolute, and only to relative URLs otherwise; a per-request `baseURL` never gets it, and `origins` replaces the rule. A request core would reject (an absolute URL with `allowAbsoluteUrls: false`) gets no token, and `getToken` isn't called. It provides the `auth` capability, which `requireSignIn` above uses. Install [`refreshOn401`](#refreshing-a-token-after-a-401) before it, so a retry gets a fresh header.

```ts
import faxios from "@gcmdev/faxios";
import { authBearer } from "@gcmdev/faxios/plugins/auth-bearer";

const store = { token: "my-token" };

const api = faxios.create({ baseURL: "https://api.example.com" }).use(authBearer(() => store.token));
await api.get("/me");
```

See [Authentication](/pages/advanced/authentication) for the options and the origin rule.

### `forwardTo`

`forwardTo(gateway, options?)` sends every request to a forwarding gateway instead of its own URL, and puts the URL it was going to in a header: `X-Forward-To`, or the `header` option. `gateway` must be an absolute `http:` or `https:` URL, and `header` a valid header name; anything else, or an unknown option, throws a `FaxiosError` when you call `forwardTo` (`ERR_BAD_OPTION_VALUE`, or `ERR_BAD_OPTION` for an unknown key).

```ts
import faxios from "@gcmdev/faxios";
import { forwardTo } from "@gcmdev/faxios/plugins/forward-to";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry())
  .use(forwardTo("http://gateway.local:8888/"));

await api.get("/accounts/{id}", { pathParams: { id: "acme co" }, params: { limit: 5 } });
// fetch: GET http://gateway.local:8888/
//        X-Forward-To: https://api.example.com/accounts/acme%20co?limit=5

await api.get("/health", { forward: false }); // straight to https://api.example.com/health
```

The header carries the final URL, with `baseURL`, `pathParams` and the validated `params` (after `paramsSchema`) applied, because the plugin doesn't rewrite `url`: it wraps the request's `env.fetch`, or the global `fetch` when there is none, so it sees what the adapter is about to send. The gateway request keeps everything else the adapter sends (method, headers, body, signal, credentials and `fetchOptions`); only the URL and the forward header change. A runtime without a global `Request` (`env.Request: null`) works too. Each try `retry` makes is forwarded the same way, whether `retry` is installed before or after `forwardTo`.

Middleware and schemas still see the target URL, not the gateway. So [`authBearer`](#authbearer)'s origin rule checks the target's origin: with both installed, the token is attached when the target is your API, and then goes to the gateway inside the forwarded request. `timing` reports the target URL too. With a custom `authBearer` header, `fetchOptions.redirect` is `"error"` for the forwarded request as well, so a redirect from the gateway rejects.

A request with `forward: false` goes straight to its own URL; `forward` accepts only `false`. The option is typed only on the instance `.use(forwardTo(…))` returns.

### `retry`

`retry(options?)` retries failed requests by calling `next` again. By default it makes up to 3 tries of idempotent methods, on network errors, timeouts and the statuses 408, 429, 500, 502, 503 and 504, with exponential backoff and jitter, and it honours `Retry-After`. Each request can turn it off with `retry: false` or override fields with `retry: { … }`.

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry({ attempts: 5 }));

await api.get("/users");
await api.post("/users", { name: "Fred" }, { retry: false });
```

See [Retry & error recovery](/pages/advanced/retry) for every option.

### `timing`

`timing(onTiming)` measures the time around `next` and calls `onTiming` once per request with a `TimingEvent`:

- on success: `{ method, url, attempt, durationMs, status }`
- on failure: `{ method, url, attempt, durationMs, error }`, where `error` is `{ code, message, status }`, and the request's error is then rethrown

`method` is upper-cased. `url` is the full URL with `baseURL` applied, as [`resolveRequestURL`](#writing-a-plugin) resolves it, and with any `user:pass@`, the query string and the fragment stripped, since those often carry secrets. A URL with `pathParams` is reported by its template as the caller wrote it (e.g. `/users/{id}`), which keeps metric labels low-cardinality. A URL core rejects, such as an absolute URL with `allowAbsoluteUrls: false`, is reported as the request gave it, not joined to `baseURL`. `durationMs` comes from `performance.now()` where available. The response is returned unchanged.

`error.code` is the `FaxiosError` code (such as `"ERR_NETWORK"` or `"ECONNABORTED"`), or the thrown error's own string `code`; `error.status` is the HTTP status when a response arrived. Each is `undefined` otherwise. The event carries no config, headers or body, not even inside `error`: the error a request rejects with holds its config, and so its credentials (`Authorization` headers, tokens in query strings, request bodies), which would then end up in logs. `error.message` is the error's message with any URL `user:pass@` stripped. The rest of the message is the error's own text, so the event is safe to log as long as your middleware, transforms and schemas keep secrets out of the errors they throw. To inspect the full error, catch the request's rejection instead.

`attempt` is the context's [`ctx.attempt`](#the-context) once the request settles:

- installed after `retry`, `timing` reports each try with its own number;
- installed before `retry`, one event covers every try and carries the final try's number, as long as no middleware between them passes `next` a copy of the context (`authBearer` does, so install it after `retry`);
- without `retry`, it is 1.

If `onTiming` throws while reporting a failure, the request still rejects with its own error. If it throws while reporting a success, the request rejects with `onTiming`'s error.

This sends durations to a metrics client, labelled by method, URL template and status:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";
import { timing } from "@gcmdev/faxios/plugins/timing";

// Stands in for your metrics client.
const metrics = {
  histogram(name: string, value: number, labels: Record<string, string>) {
    console.log(name, value, labels);
  },
};

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry())
  .use(timing(event => {
    metrics.histogram("http_client_duration_ms", event.durationMs, {
      method: event.method,
      url: event.url,
      status: event.status === undefined ? "error" : String(event.status),
    });
  }));

await api.get("/users/{id}", { pathParams: { id: "7" } });
// labels: { method: "GET", url: "https://api.example.com/users/{id}", status: "200" }
```

Here `timing` is installed after `retry`, so each try is measured on its own. Install it first to measure all tries together.
