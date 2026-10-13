# Entry points

faxios publishes several entry points, so an app loads only the parts it uses. The package root has everything and works as it always has. `@gcmdev/faxios/core` is the smaller base, and `@gcmdev/faxios/schema` and `@gcmdev/faxios/form` add schema validation and form serialization to it when you want them.

| Import path | What it includes | Use it when |
| --- | --- | --- |
| `@gcmdev/faxios` | the default `faxios` instance (built when the module loads), every feature, and the axios-compat statics | you want the full axios-style API, or don't care about bundle size |
| `@gcmdev/faxios/core` | `create()`, the instance API, errors, cancellation and `FaxiosHeaders` | you build your own instances and want the smallest bundle |
| `@gcmdev/faxios/schema` | `schema()`, which adds `requestSchema`, `responseSchema`, `paramsSchema` and `pathParamsSchema` to a core instance | a core instance needs [schema validation](/pages/advanced/schema-validation) |
| `@gcmdev/faxios/form` | `form()`, which adds form bodies, nested `params` and `formSerializer` to a core instance, plus `toFormData` and `formToJSON` | a core instance sends forms or nested query strings |
| `@gcmdev/faxios/plugins`, `@gcmdev/faxios/plugins/<name>` | `definePlugin` and the [built-in plugins](/pages/advanced/middleware#built-in-plugins) | any instance, root or core |

The [API reference](/pages/advanced/api-reference#entry-points) lists every export of each entry point.

## The package root

`@gcmdev/faxios` builds the default instance when it loads, with schema validation and form serialization installed, and attaches the axios-compat statics to it (`all`, `spread`, `Cancel`, `HttpStatusCode`, `formToJSON`, `toFormData`, `mergeConfig`, `VERSION`). Every instance it creates with `faxios.create()`, and every `new Faxios()`, has both features too. Code written for the root keeps working unchanged.

## `@gcmdev/faxios/core`

`create()` returns an instance with the same methods as one from `faxios.create()`: the HTTP method aliases, `getUri()`, `define()`, `route()`, `use()` and `eject()`. Importing the entry point builds no instance, and it has no axios-compat statics.

```ts
import { create, isFaxiosError } from "@gcmdev/faxios/core";

const api = create({ baseURL: "https://api.example.com" });

try {
  const { data } = await api.get("/users", { params: { page: 2, tags: [ "a", "b" ] } });
  console.log(data);
} catch (error) {
  if (isFaxiosError(error)) console.error(error.code, error.message);
}
```

Without the features, a core instance:

- serializes flat `params`: strings, numbers, booleans, `Date`s, and arrays of them (`tags[]=a&tags[]=b`, or `tags[0]=a` with `paramsSerializer: { indexes: true }`), with the same output as the root. A nested object rejects with `ERR_NOT_SUPPORT` naming `@gcmdev/faxios/form`, unless you pass your own `paramsSerializer.serialize`.
- sends JSON, strings, `FormData`, `URLSearchParams`, `Blob`s and streams as the root does. An object body sent as `multipart/form-data` or `application/x-www-form-urlencoded`, including through `postForm()`, `putForm()` and `patchForm()`, rejects with `ERR_NOT_SUPPORT`.
- rejects the schema options and `formSerializer` with `ERR_BAD_OPTION`, naming the entry point to install. They are type errors too: a request method called with `responseSchema` reports TS2769 (no overload matches) until you install `schema()`.

```ts
import { create, FaxiosError } from "@gcmdev/faxios/core";

const api = create({ baseURL: "https://api.example.com" });

try {
  await api.get("/search", { params: { filter: { tag: "a" } } });
} catch (error) {
  if (error instanceof FaxiosError) console.log(error.code); // "ERR_NOT_SUPPORT"
}
```

## Adding schema validation

Install `schema()` from `@gcmdev/faxios/schema` with `use()`. Keep the instance `use()` returns: its type accepts the schema options, and a `responseSchema` types `response.data`.

```ts
import { create } from "@gcmdev/faxios/core";
import { schema } from "@gcmdev/faxios/schema";
import { z } from "zod";

const api = create({ baseURL: "https://api.example.com" }).use(schema());

const { data } = await api.get("/users/{id}", {
  pathParams: { id: 1 },
  responseSchema: z.object({ name: z.string().optional() }),
});
console.log(data.name);
```

Validation behaves as on the root; see [Schema validation](/pages/advanced/schema-validation). `isSchemaValidationError` is exported from `@gcmdev/faxios/schema` as well as from the root.

## Adding form serialization

Install `form()` from `@gcmdev/faxios/form` to send object bodies as forms, serialize nested `params`, and accept `formSerializer`.

```ts
import { create } from "@gcmdev/faxios/core";
import { form } from "@gcmdev/faxios/form";

const api = create({ baseURL: "https://api.example.com" }).use(form());

await api.postForm("/avatars", { name: "Jay", avatar: new Blob([ "bytes" ], { type: "image/png" }) });
await api.get("/search", { params: { filter: { tag: "a" } } }); // ?filter[tag]=a, percent-encoded
```

The formats are the same as the root's; see [Multipart/form-data format](/pages/advanced/multipart-form-data-format) and [x-www-form-urlencoded format](/pages/advanced/x-www-form-urlencoded-format).

Features are installed per instance. A child made with `api.create()` keeps the features its parent has (it doesn't keep the parent's middleware), and `eject()` removes a feature again: pass it the same `schema()` or `form()` value you gave `use()`.

## Plugins

Each plugin entry point imports `@gcmdev/faxios/core`, never the package root, so importing a plugin doesn't build the default instance. Every built-in plugin works on a core instance:

```ts
import { create } from "@gcmdev/faxios/core";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = create({ baseURL: "https://api.example.com" }).use(retry({ attempts: 2 }));
await api.get("/users");
```

A plugin you publish should do the same: import from `@gcmdev/faxios/core` and `@gcmdev/faxios/plugins`, so it doesn't pull the root into your users' bundles.

## Sizes

CI measures each entry point with [size-limit](https://github.com/ai/size-limit) and fails when one grows past its budget. The budgets, and how each entry point is measured, are in [`packages/lib/.size-limit.json`](https://github.com/adrianbrowning/faxios/blob/main/packages/lib/.size-limit.json), which is the source of truth. At the time of writing, minified and brotli-compressed, the root is about 19 kB and `./core` about 16 kB; `./schema` adds about 5 kB and `./form` about 6 kB (measured on their own, so the parts they share with `./core` are counted in both).

What `./core` saves is mostly the code you don't load at all: the default instance, the axios-compat statics, the schema validator and the form serializers. A bundle with only `create` and a GET contains none of the form or schema modules; a test checks this with an esbuild metafile.

## Moving from the root to `./core`

1. Replace the default import with your own instance:

   ```ts
   import { create } from "@gcmdev/faxios/core";

   export const api = create({ baseURL: "https://api.example.com" });
   ```

   Requests that went through the default export (`faxios.get(...)`) go through this instance instead.

2. Import the helpers you used as statics by name: `isCancel`, `isFaxiosError`, `CanceledError`, `FaxiosError` and `FaxiosHeaders` come from `@gcmdev/faxios/core`; `toFormData` and `formToJSON` from `@gcmdev/faxios/form`. `all`, `spread`, `Cancel`, `HttpStatusCode`, `mergeConfig` and `VERSION` exist only on the root: use `Promise.all`, spread arguments yourself, `CanceledError`, and numeric status codes.

3. If you use `requestSchema`, `responseSchema`, `paramsSchema` or `pathParamsSchema`, add `.use(schema())`. If you send object bodies as forms, call `postForm()`, `putForm()` or `patchForm()`, pass nested `params` or set `formSerializer`, add `.use(form())`. The type checker points at every call that needs one: those options are type errors on a core instance without the feature.

4. Replace `new Faxios(config)` with `create(config)`; `@gcmdev/faxios/core` exports no class.

5. Remove every other import of `@gcmdev/faxios` from the app. One import of the root anywhere in the bundle brings the default instance and every feature back. Types imported with `import type` cost nothing, but the same types are exported from `@gcmdev/faxios/core`.
