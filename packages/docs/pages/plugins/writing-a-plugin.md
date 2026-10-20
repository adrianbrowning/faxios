# Writing a plugin

A plugin is middleware with a name, plus optional capabilities it provides to other plugins. Build one with `definePlugin`, the only export of `@gcmdev/faxios/plugins`. The built-in plugins use only what `@gcmdev/faxios` and `@gcmdev/faxios/plugins` export, so a plugin of your own can do anything they do:

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

To see the URL a request goes to, import `resolveRequestURL(config)` from `@gcmdev/faxios`. It is the resolver core uses for the request and for `getUri()`: `url` with `pathParams` filled in, joined to `baseURL` (honouring `allowAbsoluteUrls`), then `params`. A `URL` url is resolved as its `href`. A URL is absolute only when a scheme is followed by `//`, so `documents:batchGet` joins `baseURL`. It uses `allowAbsoluteUrls` as given and leaves the default to you: unset, an absolute `url` replaces `baseURL`. Core sets it from the instance defaults before middleware runs, so `ctx.config` already holds it. It always returns a string, or throws the `FaxiosError` the request would reject with: `ERR_INVALID_URL` for an absolute URL that `allowAbsoluteUrls: false` refuses and for a config with neither `url` nor `baseURL`, `ERR_BAD_OPTION_VALUE` for a `url` that isn't a string or `URL` and for a placeholder `pathParams` can't fill. In middleware, schemas haven't run yet, so it uses `pathParams` and `params` as the caller gave them. To check only the origin, as `authBearer` does, pass `{ ...ctx.config, pathParams: undefined, params: undefined }`: a `pathParamsSchema` may fill or rename placeholders the raw `pathParams` can't, and path params never move the origin.

```ts expect=log:https://api.example.com/users/7?q=1
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

## Reuse core's helpers

The package root exports the rules core uses for signals, cancellation and prototype walks, so import them from `@gcmdev/faxios` instead of copying them into a plugin: `assertSignal` (reject a `signal` faxios can't watch), `onAbort` and `raceAbort` (with the `AbortableSignal` type) to react to or race an abort, `canceledFromSignal` for the error an aborted request rejects with, and `hasOwnInPrototypeChain` to read an option without trusting a polluted `Object.prototype`, and `stripUserInfo` (a URL) and `stripUserInfoInText` (free text such as an error message) to remove `user:pass@` before logging. See the [API reference](/pages/advanced/api-reference) for each signature.

## Typing a plugin factory

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
