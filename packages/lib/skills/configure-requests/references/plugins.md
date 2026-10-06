# Plugin authoring

Read this before writing a reusable faxios plugin, typing middleware options, or sharing a value
between plugins. Plain one-off middleware (`api.use(async (ctx, next) => ...)`) does not need it.

## Build a plugin with `definePlugin`

`definePlugin` comes from `@gcmdev/faxios/plugins`. It returns the same object and only changes the
types. faxios infers the plugin's slots:

- **options**: request options the plugin reads, from the first type argument of the middleware's
  `ctx: FaxiosContext<Options, Capabilities>` annotation. They become valid keys on every
  config-taking call of the instance `.use()` returns.
- **requires**: capabilities that must already be installed, from the second type argument.
- **provides**: capabilities this plugin adds to `ctx.capabilities`, from the `provides` value.

```ts
import faxios, { type FaxiosContext } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";

type TraceOptions = { trace?: string | false };

export function traceHeader(header = "X-Trace-Id") {
  return definePlugin({
    name: "traceHeader",
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

Check: `faxios.get("/orders", { trace: "x" })` on an instance without the plugin is a type error.

## Require a capability from another plugin

`authBearer` provides `{ auth: { getToken(): Promise<string> } }`, exported as
`AuthBearerCapability`. A plugin that needs it declares it in its context type, and `.use()` rejects
installing it before `authBearer`:

```ts
import faxios, { FaxiosError, type FaxiosContext } from "@gcmdev/faxios";
import { definePlugin } from "@gcmdev/faxios/plugins";
import { authBearer, type AuthBearerCapability } from "@gcmdev/faxios/plugins/auth-bearer";

function refreshOn401(refresh: () => Promise<void>) {
  return definePlugin({
    name: "refreshOn401",
    middleware: async (ctx: FaxiosContext<unknown, AuthBearerCapability>, next) => {
      try {
        return await next(ctx);
      }
      catch (error) {
        if (!(error instanceof FaxiosError) || error.response?.status !== 401) throw error;
        await refresh();
        ctx.config.headers.set("Authorization", `Bearer ${await ctx.capabilities.auth.getToken()}`);
        return next(ctx);
      }
    },
  });
}

let token = "old";
const api = faxios
  .create({ baseURL: "https://api.example.com" })
  .use(authBearer(() => token))
  .use(refreshOn401(async () => { token = "new"; }));
```

## Rules `.use()` enforces at runtime

- `name` must be a non-empty own string, otherwise `ERR_BAD_OPTION_VALUE`.
- Two plugins on one instance cannot provide the same capability name (`ERR_BAD_OPTION`).
- Built-in plugin options are validated strictly: unknown or mistyped keys throw
  `ERR_BAD_OPTION` / `ERR_BAD_OPTION_VALUE` when the plugin is created or when a per-request
  override is read.
- `create()` children do not inherit middleware or plugins.

Sources: `src/lib/plugins/definePlugin.ts`, `src/lib/types.ts` (`FaxiosContext`, `FaxiosPlugin`),
`src/lib/core/Faxios.ts` (`use`), `packages/tests/unit/plugins/authBearer.test.ts`,
`packages/tests/unit/plugins/definePlugin.test.ts`.
