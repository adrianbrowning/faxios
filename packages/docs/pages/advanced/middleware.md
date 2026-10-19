# Middleware

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

For the built-in plugins and how to write your own, see [Plugins](/pages/plugins/).

## Ordering

Middleware runs in registration order on the way in and in reverse order on the way out. With `a` installed before `b`:

```text
request  ──▶ a before ──▶ b before ──▶ dispatch ──┐
                                                  │  fetch
response ◀── a after  ◀── b after  ◀──────────────┘
```

```ts expect=log:'a%20before'%2C%20'b%20before'%2C%20'b%20after'%2C%20'a%20after'
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
- `ctx.capabilities` holds the values plugins [provide](/pages/plugins/writing-a-plugin#capabilities). It is shared by every request of the instance.
- `ctx.attempt` is the try the context leads to, counting from 1. It starts at 1 for every request; [`retry`](/pages/plugins/retry) sets it before each try, and a retry middleware of your own [can too](#calling-next-again-retries).
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

To change a field for the rest of the chain, pass `next` a copy made with a spread, such as `next({ ...ctx, state: { ...ctx.state, user } })`. The spread also carries what core keeps on the context for the request, such as the stream body that `timeout` and the request's signal still govern after the response. A context built from its fields instead keeps that tracking only while it passes on the same `ctx.state` object.

For bearer tokens, use the built-in [`authBearer`](/pages/plugins/auth-bearer) plugin rather than setting `Authorization` yourself: it only sends the token to your API's origin.

## How `next` works

### Each call dispatches a copy

`next(ctx)` runs the rest of the chain and then dispatches a copy of `ctx.config`. Changes dispatch makes, such as `transformRequest` output and schema output, go to the copy and never show up on `ctx.config`. Dispatch fills in path params only in the URL it sends, so `ctx.config.url` keeps the template:

```ts expect=log:/users/%7Bid%7D
import faxios from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  const response = await next(ctx);
  console.log(ctx.config.url); // "/users/{id}": dispatch fills in path params only in the URL it sends
  return response;
});

await api.get("/users/{id}", { pathParams: { id: "7" } });
```

### Calling `next` again retries

Because every call starts from the same input, calling `next` again sends the request again. This middleware retries network errors up to two more times, and sets `ctx.attempt` before each try so middleware after it, such as [`timing`](/pages/plugins/timing), knows which try it is on:

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

For real use, install the built-in [`retry`](/pages/plugins/retry) plugin, which adds backoff, `Retry-After` support and a per-request option.

Calling `next` again is safe when the body can be read again, such as a string, an object, a `Blob` or `FormData`. A stream body is used up by the first try, so sending it again rejects with a `FaxiosError` whose code is `ERR_BAD_REQUEST`.

### Error statuses arrive as rejections

`validateStatus` rejects non-2xx responses by default, so middleware sees a 404 or 500 as a rejected `FaxiosError`, not as a response. Catch it around `next`; the response is on `err.response`. This middleware turns a 404 back into a response:

```ts status=404 expect=log:404
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

This plugin refreshes the token once after a 401 and retries. Install it before [`authBearer`](/pages/plugins/auth-bearer). It never sets `Authorization` itself: `authBearer` runs again inside the second `next`, calls `getToken` again and applies its origin rule, so a 401 from a third-party URL is retried without your token. All 401s wait for one shared refresh, because with rotating refresh tokens a second refresh sends a token the first one already spent.

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

A middleware that returns a response without calling `next` sends nothing. Dispatch doesn't run at all, so neither do the schema checks. The [`cache()` example](/pages/plugins/writing-a-plugin#typed-request-options) works this way.

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
