# Route builder: `route()`

`faxios.route(url, config?)` creates a builder with typed HTTP method helpers and shared route-level config:

```ts
import faxios from "@gcmdev/faxios";
import { z } from "zod";

const users = faxios.route("/users/{id}", {
  pathParamsSchema: z.object({ id: z.string() }),
});

const getUser = users.get({ responseSchema: z.object({ name: z.string() }) });
const updateUser = users.put({ requestSchema: z.object({ name: z.string() }) });

await updateUser({ pathParams: { id: "123" }, data: { name: "Fred" } });
```

`route()` is available on the default export and on every instance created with `faxios.create()`. The builder and its endpoint functions have no `.use()`, so middleware goes on the instance. Call `route()` on the instance `.use()` returned, for example `faxios.create({ baseURL }).use(retry()).route("/users/{id}", config)`: only that value types plugin options such as `retry` on the endpoints.

## Method helpers

The builder has `get`, `post`, `put`, `patch`, `delete`, `head`, and `options`. Each helper takes an optional method-level config and returns an endpoint function that behaves like one created by [`faxios.define()`](/pages/advanced/define), including the per-call config rules.

## Route-level and method-level config

- Route-level config accepts `pathParamsSchema` plus any request config field except `url`, `method`, `pathParams`, `params`, `data`, and the other schema options. It applies to every method helper.
- Method-level config accepts `paramsSchema`, `requestSchema`, `responseSchema`, and the same request config fields. Method-level values override route-level values.
- The route-level `pathParamsSchema` always applies; method-level config cannot replace it.

See [Schema validation](/pages/advanced/schema-validation) for what each schema checks and the error codes it produces.
