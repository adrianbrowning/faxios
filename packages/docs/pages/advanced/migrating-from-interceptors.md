# Migrating from interceptors

faxios no longer has interceptors. `faxios.interceptors.request`, `faxios.interceptors.response` and their types are gone. Use `.use()` [middleware](/pages/advanced/middleware) instead: one function that runs around the request, with code before `await next(ctx)` for the way in and code after it for the way out.

This page shows how each interceptor feature maps to middleware. The "before" snippets are the old interceptor code and no longer compile.

## The mapping

| Interceptor | Middleware |
| --- | --- |
| Request interceptor `(config) => config` | Code before `await next(ctx)` that changes `ctx.config` |
| Response interceptor `(response) => response` | Code after `await next(ctx)` that reads or changes the response |
| `onRejected` handler | A `try`/`catch` around `await next(ctx)` |
| `runWhen` option | An `if` that calls `return next(ctx)` straight away |
| `synchronous` option | No equivalent |
| `eject(id)` | `eject(middleware)`, with the same function reference |
| `clear()` | `eject()` each middleware, or start again with `create()` |
| `transitional.legacyInterceptorReqResOrdering` | Removed; passing it throws `ERR_BAD_OPTION` |

`use()` returns the same instance with a new type. Keep the chained result and make requests with it: `api.use(plugin)` changes `api` at runtime too, but only the returned value is typed with the plugin's request options. Instances made with `create()` start with no middleware, even when the parent has some.

## Request interceptors

Before, an interceptor that adds an auth header:

```diff
- const api = faxios.create({ baseURL: "https://api.example.com" });
-
- api.interceptors.request.use((config) => {
-   config.headers.set("Authorization", `Bearer ${getToken()}`);
-   return config;
- });
```

After, the same change made before `next`:

```ts
import faxios from "@gcmdev/faxios";

const getToken = () => "my-token";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  ctx.config.headers.set("Authorization", `Bearer ${getToken()}`);
  return next(ctx);
});

await api.get("/users");
```

`ctx.config` is the request config after it has been merged with the instance defaults, and `ctx.config.headers` is always a `FaxiosHeaders` instance. You change it in place; there is nothing to return except the result of `next`.

For bearer tokens specifically, the built-in [`authBearer`](/pages/advanced/authentication) plugin does this for you, and only sends the token to your own API's origin.

## Response interceptors

Before, an interceptor that unwraps `data`:

```diff
- api.interceptors.response.use((response) => response.data);
-
- const users = await api.get("/users"); // the body, not a response
```

Middleware always resolves to a response, so it can't turn `api.get()` into a call that returns only the body. Take `data` where you make the call:

```ts
import faxios from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" });

const { data: users } = await api.get("/users");
console.log(users);
```

If the interceptor unwrapped an envelope such as `{ "data": [...] }`, do it after `next` and return the response:

```ts
import faxios from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  const response = await next(ctx);
  const body = response.data;
  if (body !== null && typeof body === "object" && "data" in body) {
    response.data = body.data;
  }
  return response;
});

const response = await api.get("/users");
console.log(response.data);
```

## Error handlers

An `onRejected` handler becomes a `try`/`catch` around `next`. Rethrow what you don't handle, the same as rejecting from the handler.

Before, a response interceptor that refreshes the token and retries a request that failed with 401:

```diff
- api.interceptors.response.use(
-   (response) => response,
-   async (error) => {
-     const original = error.config;
-     if (error.response?.status !== 401 || original._retry) throw error;
-     original._retry = true;
-     await refreshToken();
-     original.headers.set("Authorization", `Bearer ${getToken()}`);
-     return api(original);
-   }
- );
```

After:

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";

let token = "expired";
const getToken = () => token;
const refreshToken = async () => {
  token = "fresh";
};

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  ctx.config.headers.set("Authorization", `Bearer ${getToken()}`);
  try {
    return await next(ctx);
  }
  catch (err) {
    if (!(err instanceof FaxiosError) || err.response?.status !== 401) throw err;
    await refreshToken();
    ctx.config.headers.set("Authorization", `Bearer ${getToken()}`);
    return next(ctx);
  }
});

await api.get("/me");
```

The `_retry` flag is no longer needed. Calling `next(ctx)` again sends the request through the rest of the chain once more, and the second call is outside the `try`, so a second 401 is thrown to the caller. Each call to `next` starts from `ctx.config`; changes the request pipeline makes while sending (path parameters, `transformRequest`, header normalization) are made on a copy and don't build up between tries.

With `authBearer` installed, a small `refreshOn401` plugin can do the same using the token the plugin provides. See [Authentication](/pages/advanced/authentication). For retrying network errors and 5xx responses, use the built-in [`retry`](/pages/advanced/retry) plugin.

## Order

Middleware runs in registration order on the way in, and in reverse order on the way out:

```
a before -> b before -> dispatch -> b after -> a after
```

Interceptors did not work this way. Request interceptors ran last-registered-first, and response interceptors ran first-registered-first. So when you turn each interceptor into its own middleware, register them in the reverse order of the interceptors they replace. That holds for both kinds: a request interceptor added last ran first, and the middleware that replaces it must be registered first; a response interceptor added first ran first, and the middleware registered last is the first to see the response.

```ts
import faxios from "@gcmdev/faxios";

const order: Array<string> = [];
const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(async (ctx, next) => {
    order.push("a before");
    const response = await next(ctx);
    order.push("a after");
    return response;
  })
  .use(async (ctx, next) => {
    order.push("b before");
    const response = await next(ctx);
    order.push("b after");
    return response;
  });

await api.get("/users");
console.log(order); // [ "a before", "b before", "b after", "a after" ]
```

When an interceptor pair belongs together, such as a request interceptor that starts a timer and a response interceptor that stops it, write it as one middleware. The before and after code then share local variables, or `ctx.state` if they are in different middleware.

## `runWhen`

Before:

```diff
- api.interceptors.request.use(
-   (config) => {
-     config.headers.set("X-Test", "special get headers");
-     return config;
-   },
-   null,
-   { runWhen: (config) => config.method === "get" }
- );
```

After, check the condition yourself and call `next` straight away when it doesn't match:

```ts
import faxios from "@gcmdev/faxios";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  if (ctx.config.method !== "get") return next(ctx);
  ctx.config.headers.set("X-Test", "special get headers");
  return next(ctx);
});

await api.get("/users");
```

`ctx.config.method` is lowercase by the time middleware runs.

## `synchronous`

The `synchronous` option has no equivalent. Middleware is always an async function. A middleware that calls `next(ctx)` without awaiting anything first reaches the adapter in the same tick, as a request without middleware does.

## `eject`

`interceptors.request.use()` returned an id that you passed to `eject()`. `use()` now returns the instance, so keep a reference to the middleware itself and pass the same function to `eject()`:

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosMiddleware } from "@gcmdev/faxios";

const addHeader: FaxiosMiddleware = async (ctx, next) => {
  ctx.config.headers.set("X-Test", "1");
  return next(ctx);
};

const api = faxios.create({ baseURL: "https://api.example.com" }).use(addHeader);
await api.get("/users"); // sends X-Test

api.eject(addHeader);
await api.get("/users"); // doesn't
```

`eject()` works the same way for a plugin: pass the plugin object you gave to `use()`. Requests already in flight keep the middleware they started with.

There is no `clear()`. Eject each middleware, or make a fresh instance with `create()`.

## `legacyInterceptorReqResOrdering`

The `transitional.legacyInterceptorReqResOrdering` option is gone. Passing it rejects the request with a `FaxiosError` whose code is `ERR_BAD_OPTION` ("Unknown option legacyInterceptorReqResOrdering"). Remove it from your config.
