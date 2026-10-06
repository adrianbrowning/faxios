# Creating an instance

`faxios.create()` lets you create a pre-configured faxios instance. The instance shares the same request and response API as the default `faxios` object, but uses the config you provide as its baseline for every request. This is the recommended way to use faxios in any application larger than a single file.

```ts
import faxios from "@gcmdev/faxios";

const instance = faxios.create({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: { "X-Custom-Header": "foobar" },
});
```

The `create` method accepts the full [Request Config](/pages/advanced/request-config) object. You can then use the instance just like the default faxios object:

```js
import faxios from "@gcmdev/faxios";

const instance = faxios.create({ baseURL: "https://api.example.com" });

const response = await instance.get("/users/1");
```

## Instance methods

Instances have the same methods as the default `faxios` object. faxios merges the config you pass to a method with the instance config.

- `instance.request(config)`
- `instance.get(url[, config])`
- `instance.delete(url[, config])`
- `instance.head(url[, config])`
- `instance.options(url[, config])`
- `instance.post(url[, data[, config]])`
- `instance.put(url[, data[, config]])`
- `instance.patch(url[, data[, config]])`
- `instance.getUri([config])`
- `instance.use(middlewareOrPlugin)`
- `instance.eject(middlewareOrPlugin)`

See [Request aliases](/pages/advanced/request-method-aliases) for the full list, including the form shorthand methods. Instances also have [`define()`](/pages/advanced/define) and [`route()`](/pages/advanced/route). `use()` and `eject()` add and remove [middleware and plugins](/pages/advanced/middleware).

## Why use an instance?

### Per-service base URL

In most apps you talk to more than one API. Creating a separate instance per service avoids repeating the base URL on every call:

```js
import faxios from "@gcmdev/faxios";

const githubApi = faxios.create({ baseURL: "https://api.github.com" });
const internalApi = faxios.create({ baseURL: "https://api.internal.example.com" });

const { data: repos } = await githubApi.get("/users/faxios/repos");
const { data: users } = await internalApi.get("/users");
```

### Shared authentication headers

Attach an auth token to every request from one instance without touching others:

```js
import faxios from "@gcmdev/faxios";

const getToken = () => "my-token";

const authApi = faxios.create({
  baseURL: "https://api.example.com",
  headers: {
    Authorization: `Bearer ${getToken()}`,
  },
});
```

### Per-service timeouts and retries

Different services have different reliability characteristics. Set a tight timeout for real-time services and a relaxed one for batch jobs:

```js
import faxios from "@gcmdev/faxios";

const realtimeApi = faxios.create({ baseURL: "https://realtime.example.com", timeout: 2000 });
const batchApi    = faxios.create({ baseURL: "https://batch.example.com",    timeout: 60000 });
```

### Isolated middleware

[Middleware](/pages/advanced/middleware) installed with `use()` only runs for that instance, keeping your concerns separate:

```js
import faxios from "@gcmdev/faxios";

const loggingApi = faxios.create({ baseURL: "https://api.example.com" }).use(async (ctx, next) => {
  console.log(`→ ${ctx.config.method?.toUpperCase()} ${ctx.config.url}`);
  return next(ctx);
});

await loggingApi.get("/users");
```

`use()` returns the same instance with a new type, so keep and use the chained result: only that value's type knows the request options a plugin adds.

Children made with `create()` start with no middleware, even when you call it on an instance that has some. They also start without the parent's plugin types, so call `use()` on the child for each plugin it needs:

```ts
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create({ baseURL: "https://api.example.com" }).use(retry());

// Same baseURL as api, but no retry() until it is installed again.
const reportsApi = api.create({ timeout: 60_000 }).use(retry({ attempts: 2 }));

await reportsApi.get("/reports");
```

## Overriding defaults per request

Config passed at request time always overrides the instance defaults:

```js
import faxios from "@gcmdev/faxios";

const api = faxios.create({ timeout: 5000 });

// This specific request uses a 30-second timeout instead
await api.get("/slow-endpoint", { timeout: 30000 });
```

::: tip
Instance defaults can also be changed after creation by writing to `instance.defaults`:

```js
import faxios from "@gcmdev/faxios";

const instance = faxios.create();
const newToken = "new-token";

instance.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
```
:::
