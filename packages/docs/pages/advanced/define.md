# Typed endpoints: `define()`

`faxios.define(method, url, config?)` creates a reusable, fully typed endpoint function. Schemas are locked at define time:

```ts check=types
import faxios from "@gcmdev/faxios";
import { z } from "zod";

const getUser = faxios.define("get", "/users/{id}", {
  pathParamsSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ name: z.string(), age: z.number() }),
});

const response = await getUser({ pathParams: { id: "123" } });
const user: { name: string; age: number } = response.data; // inferred from responseSchema
```

`define()` is available on the default export and on every instance created with `faxios.create()`. It returns a plain function with no `.use()`, so middleware goes on the instance. Call `define()` on the instance `.use()` returned: each call goes through that instance's `request()`, so its defaults and [middleware](/pages/advanced/middleware) apply, and only that value types plugin options such as `retry`. Middleware added to the instance after `define()` still runs on later calls, but its options are not typed on the endpoint.

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

## Define-time config

The third argument accepts `pathParamsSchema`, `paramsSchema`, `requestSchema`, `responseSchema`, and any other [request config](/pages/advanced/request-config) field except `url`, `method`, `pathParams`, `params`, and `data`. Use it for endpoint-wide settings such as `headers` or `timeout`.

See [Schema validation](/pages/advanced/schema-validation) for what each schema checks and the error codes it produces.

## Per-call config

The endpoint function takes a per-call config:

- `pathParams`, `params`, and `data` are typed from the input type of `pathParamsSchema`, `paramsSchema`, and `requestSchema`. Each one is required when its schema is set, and the per-call config is then required too. Without its schema, each one is optional and typed as in the [request config](/pages/advanced/request-config), so `faxios.define("get", "/users/{id}")({ pathParams: { id: 1 }, params: { q: "x" } })` type-checks.
- `response.data` is typed from the output type of `responseSchema`. It is read from the schema's `validate` result, so a [Standard Schema](https://standardschema.dev) with no `~standard.types` field still infers it.
- Other request config fields, such as `headers`, `timeout`, or `signal`, are optional and override the define-time values.
- `url`, `method`, and the four schema options cannot be passed per call. If a JavaScript caller passes them anyway, faxios ignores them.

Schemas set at define time cannot be overridden per call (security by design).

```ts
import faxios from "@gcmdev/faxios";
import { z } from "zod";

const createUser = faxios.define("post", "/users", {
  requestSchema: z.object({ name: z.string() }),
});

const controller = new AbortController();
await createUser({
  data: { name: "Fred" },
  signal: controller.signal,
});
```

To share a URL and config across several methods, use [`faxios.route()`](/pages/advanced/route).
