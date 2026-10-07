# TypeScript

`faxios` ships TypeScript definitions in the npm package via `index.d.ts`, so type checking and editor support work out of the box.

## Module resolution caveats

faxios is published as ESM only, so there are a few configuration caveats:

- The recommended setting is `"moduleResolution": "node16"` (implied by `"module": "node16"`) or `"bundler"`. `node16` requires TypeScript 4.7 or greater.
- If you use ESM, your settings should be fine.
- There is no CJS build and no `index.d.cts`; load faxios with `import`.

## Type guards for faxios errors

Use the `faxios.isFaxiosError` type guard to safely narrow `unknown` errors in `catch` blocks. After narrowing, you can access faxios-specific properties like `error.response`, `error.config`, and `error.code` with full type safety.

```ts
import faxios from "@gcmdev/faxios";

type User = { id: number; name: string };

let user: User | null = null;
try {
  const { data } = await faxios.get<{ userDetails: User }>("/user?ID=12345");
  user = data.userDetails;
} catch (error) {
  if (faxios.isFaxiosError(error)) {
    console.error(error.code, error.response?.status);
  } else {
    throw error;
  }
}
```

Use `faxios.isCancel()` to narrow cancellation errors to `CanceledError`:

```ts
import faxios from "@gcmdev/faxios";

type User = { id: number; name: string };

const controller = new AbortController();

try {
  await faxios.get<User>("/user?ID=12345", { signal: controller.signal });
} catch (error) {
  if (faxios.isCancel(error)) {
    console.log("Request canceled:", error.message);
  }
}
```

## Typed instances and middleware

`faxios.create()` returns a `FaxiosInstance`. Middleware passed inline to `use()` is typed from the instance, so `ctx.config` and `next` need no annotations:

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosInstance } from "@gcmdev/faxios";

const apiClient: FaxiosInstance = faxios.create({
  baseURL: "https://api.example.com",
  timeout: 10000,
}).use(async (ctx, next) => {
  // ctx.config.headers is a FaxiosHeaders
  ctx.config.headers.set("X-Client", "docs-example");
  return next(ctx);
});

await apiClient.get("/users");
```

Plain middleware adds nothing to the type, so `FaxiosInstance` still fits. To write middleware outside `use()`, annotate it with `FaxiosMiddleware`, or annotate its context with `FaxiosContext`.

## Typed plugins

Plugins add request options and capabilities to the instance type. `use()` returns the same instance with that new type, so keep the chained result and send requests through it. Annotating the variable as a plain `FaxiosInstance` would throw the plugin's options away:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

// api's type includes RetryRequestOptions, so the `retry` option is accepted.
const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry());

await api.get("/users", { retry: { attempts: 5 } });
await api.post("/users", { name: "Fred" }, { retry: false });

// Without retry() installed, the option is a type error.
// @ts-expect-error TS2769 -- this instance has no retry option
await faxios.create().get("/users", { retry: false });
```

Plugin options are typed on every config-taking member, including `defaults`, `define()` and `route()`. Excess-property checks only run on object literals, so a config held in a variable can still carry a plugin option the instance doesn't have.

`create()` children start with no middleware and no plugin types. `eject()` doesn't narrow the type either: options a removed plugin added stay in it.

A plugin that requires a capability, such as a token-refresh plugin that needs `auth` from `authBearer`, is a type error when installed before the plugin that provides it. To write your own typed plugins with `definePlugin` and `FaxiosPlugin<{ requires?; provides?; options? }>`, see [Writing a plugin](/pages/advanced/middleware#writing-a-plugin) and [Typed request options](/pages/advanced/middleware#typed-request-options).

## Typing response data

faxios request methods are generic over the response data type. Pass a type parameter to `faxios.get<T>` (and the other aliases) to type `response.data`:

```ts
import faxios from "@gcmdev/faxios";

interface User {
  id: number;
  name: string;
}

const { data } = await faxios.get<User>("/users/1");
// `data` is typed as `User`
```

## Inferring response data from a schema

When using `responseSchema`, TypeScript infers `response.data` from the schema's output type automatically — no manual generic needed:

```ts check=types
import faxios from "@gcmdev/faxios";
import { z } from "zod";

const UserSchema = z.object({ name: z.string(), age: z.number() });
const { data } = await faxios.get("/user/1", { responseSchema: UserSchema });
// data is typed as { name: string; age: number }
```

See [Schema validation](/pages/advanced/schema-validation), and [`define()`](/pages/advanced/define) / [`route()`](/pages/advanced/route) for typed endpoint functions.
