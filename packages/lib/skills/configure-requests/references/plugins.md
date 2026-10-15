# Plugins

Read this before installing the built-in plugins (`authBearer`, `forwardTo`, `retry`, `timing`),
writing a reusable faxios plugin, typing middleware options, or sharing a value between plugins. Plain
one-off middleware (`api.use(async (ctx, next) => ...)`) does not need it.

## Install the built-in plugins

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

Check: `faxios.get("/health", { retry: false })` on the default export (or any instance without
`retry()` installed) is a type error. Use the value `.use()` returned. The option defaults and
ordering rules are in the SKILL.md "Use the built-in plugins from their subpaths" section.

To reach the API through a forwarding gateway, install `forwardTo`; requests then go to the
gateway with the target URL in `X-Forward-To`, and `forward: false` skips it:

```ts
import faxios from "@gcmdev/faxios";
import { forwardTo } from "@gcmdev/faxios/plugins/forward-to";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(retry())
  .use(forwardTo("http://gateway.local:8888/"));

await api.get("/accounts/{id}", { pathParams: { id: "acme" } }); // X-Forward-To: https://api.example.com/accounts/acme
await api.get("/health", { forward: false });                    // sent straight to the API
```

## Define endpoints on a plugin instance

`define()` and `route()` return plain functions with no `.use()`. Install plugins first and call
`define()` on the value `.use()` returned, so the endpoint's per-call config types `retry`:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";
import { z } from "zod";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry());
const getProject = api.define("get", "/accounts/{account}/projects/{project}", {
  pathParamsSchema: z.object({ account: z.string(), project: z.string() }),
});
await getProject({ pathParams: { account: "acme", project: "main" }, retry: { attempts: 2 } });
```

## Build a plugin with `definePlugin`

`definePlugin` comes from `@gcmdev/faxios/plugins`. It returns the same object and only changes the
types. faxios infers the plugin's slots:

- **options**: request options the plugin reads, from the first type argument of the middleware's
  `ctx: FaxiosContext<Options, Capabilities>` annotation. They become valid keys on every
  config-taking call of the instance `.use()` returns. The plugin must also name each one in its
  `options` value (`options: { trace: true }`); faxios rejects any request config key that no
  installed plugin names, and `definePlugin` makes the names required.
- **requires**: capabilities that must already be installed, from the second type argument.
- **provides**: capabilities this plugin adds to `ctx.capabilities`, from the `provides` value.

```ts
import faxios, { type FaxiosContext } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";

type TraceOptions = { trace?: string | false };

export function traceHeader(header = "X-Trace-Id") {
  return definePlugin({
    name: "traceHeader",
    options: { trace: true },
    middleware: async (ctx: FaxiosContext<TraceOptions>, next) => {
      const trace = ctx.config.trace;
      if (trace !== false) ctx.config.headers.set(header, trace ?? crypto.randomUUID());
      return next(ctx);
    },
  });
}

const api = faxios.create({ baseURL: "https://api.example.com" }).use(traceHeader());
await api.get("/orders", { trace: "abc-123" }); // `trace` type-checks only on `api`
```

Check: `faxios.get("/orders", { trace: "x" })` on an instance without the plugin is a type error,
and at runtime it rejects with `ERR_BAD_OPTION` (`Unknown option trace`).

## Read the URL a request goes to

Import `resolveRequestURL(config)` from `@gcmdev/faxios`; never join `baseURL` and `url` by hand.
It is the resolver core uses for the request and `getUri()`: `pathParams` filled in, `baseURL`
joined (honouring `allowAbsoluteUrls` as given: unset, an absolute `url` wins; core sets it from
the instance defaults before middleware), `params` serialized; a `URL` url resolves as its `href`.
A URL is absolute only with a scheme and `//`, so `documents:batchGet` joins `baseURL`. It always
returns a string or throws what the request would reject with (`ERR_INVALID_URL`, also for no
`url` and no `baseURL`; `ERR_BAD_OPTION_VALUE`, also for a `url` that isn't a string or `URL`), so
a plugin that guards credentials treats a throw as "don't attach". Middleware runs before
`pathParamsSchema`, so for an origin check resolve with
`pathParams: undefined` (and `params: undefined`): a schema may fill or rename placeholders the raw
`pathParams` can't, and path params never move the origin. For the API origin use
`ctx.instanceBaseURL`, not `ctx.config.baseURL`, which a per-request override can point anywhere.

```ts
import faxios, { FaxiosHeaders, resolveRequestURL } from "@gcmdev/faxios";
import type { InternalFaxiosRequestConfig } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";

const apiKey = (key: string) => definePlugin({
  name: "apiKey",
  middleware: async (ctx, next) => {
    let sameAPI = false;
    try {
      // Both throw for a URL that isn't absolute, or one core would reject: no key then.
      const url = resolveRequestURL({ ...ctx.config, pathParams: undefined, params: undefined });
      sameAPI = new URL(url).origin === new URL(ctx.instanceBaseURL ?? "").origin;
    }
    catch {
      sameAPI = false;
    }
    if (!sameAPI) return next(ctx);
    // Fetch strips only Authorization on a cross-origin redirect, so refuse redirects for a
    // custom credential header unless the caller chose, as authBearer does. Read `redirect` as an
    // own key, so a polluted Object.prototype can't choose, and build a null-prototype copy.
    const headers = new FaxiosHeaders(ctx.config.headers).set("X-Api-Key", key);
    const fetchOptions = ctx.config.fetchOptions;
    const redirect = fetchOptions && Object.hasOwn(fetchOptions, "redirect") && fetchOptions.redirect !== undefined
      ? fetchOptions.redirect
      : "error";
    const config: InternalFaxiosRequestConfig = Object.assign(Object.create(null) as InternalFaxiosRequestConfig, ctx.config, {
      headers,
      fetchOptions: { ...fetchOptions, redirect },
    });
    return next({ ...ctx, config });
  },
});

const api = faxios.create({ baseURL: "https://api.example.com" }).use(apiKey("k"));
await api.get("/orders");
```

## Require a capability from another plugin

`authBearer` provides `{ auth: { getToken(): Promise<string> } }`, exported as
`AuthBearerCapability`. A plugin that needs it declares it in its context type, and `.use()` rejects
installing it before `authBearer`:

```ts
import faxios, { type FaxiosContext } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";
import { authBearer, type AuthBearerCapability } from "@gcmdev/faxios/plugins/auth-bearer";

function requireSignIn() {
  return definePlugin({
    name: "requireSignIn",
    middleware: async (ctx: FaxiosContext<unknown, AuthBearerCapability>, next) => {
      if (!(await ctx.capabilities.auth.getToken())) throw new Error("Sign in first");
      return next(ctx);
    },
  });
}

const api = faxios
  .create({ baseURL: "https://api.example.com" })
  .use(authBearer(() => "token"))
  .use(requireSignIn());
```

## Refresh a token after a 401

Install the refresh plugin before `authBearer` and never set `Authorization` in it. The retry
runs `authBearer` again, which calls `getToken` and applies its origin rule, so a third-party 401
is retried without the token. Share one in-flight refresh so rotating refresh tokens aren't spent twice:

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
      catch (error) {
        if (!(error instanceof FaxiosError) || error.response?.status !== 401) throw error;
        refreshing ??= refresh().finally(() => { refreshing = undefined; });
        await refreshing;
        return next(ctx);
      }
    },
  });
}

let token = "old";
const api = faxios
  .create({ baseURL: "https://api.example.com" })
  .use(refreshOn401(async () => { token = "new"; }))
  .use(authBearer(() => token));
```

Calling `next` again re-sends the body. A stream body is used up by the first try; sending it
again rejects with `ERR_BAD_REQUEST`.

## Report the try number from your own retry

`ctx.attempt` is the try a context leads to, from 1. `retry` sets it before each try; a hand-written
retry sets it the same way, and `timing` installed after it reports each try's number:

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";
import { timing } from "@gcmdev/faxios/plugins/timing";

const api = faxios
  .create({ baseURL: "https://api.example.com" })
  .use(async (ctx, next) => {
    for (let attempt = 1; ; attempt++) {
      ctx.attempt = attempt;
      try {
        return await next(ctx);
      }
      catch (error) {
        if (attempt === 3 || !(error instanceof FaxiosError) || error.code !== FaxiosError.ERR_NETWORK) throw error;
      }
    }
  })
  .use(timing(event => console.log(event.attempt, event.durationMs)));
```

Don't keep the try number in a private symbol on `ctx.state`: other plugins can't read it.

## Rules `.use()` enforces at runtime

- `name` must be a non-empty own string, otherwise `ERR_BAD_OPTION_VALUE`.
- Two plugins on one instance cannot provide the same capability name (`ERR_BAD_OPTION`).
- Built-in plugin options are validated strictly: unknown or mistyped keys throw
  `ERR_BAD_OPTION` / `ERR_BAD_OPTION_VALUE` when the plugin is created or when a per-request
  override is read.
- `create()` children do not inherit middleware or plugins, nor the parent's defaults for plugin
  options. `eject()` removes the defaults for the options the ejected plugin declared.

Sources: `src/lib/plugins/definePlugin.ts`, `src/lib/types.ts` (`FaxiosContext`, `FaxiosPlugin`),
`src/lib/core/Faxios.ts` (`use`), `packages/tests/unit/plugins/authBearer.test.ts`,
`packages/tests/unit/plugins/definePlugin.test.ts`, `packages/tests/unit/plugins/forwardTo.test.ts`,
`packages/tests/unit/plugins/timing.test.ts`.
