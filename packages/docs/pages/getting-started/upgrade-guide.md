# Coming from axios

faxios keeps most of the axios request API, but it sends every request with the web-standard `fetch` API and has no adapters or interceptors. This page covers the changes most axios code needs. The [migration guide](https://github.com/adrianbrowning/faxios/blob/main/MIGRATION_GUIDE.md) lists every difference.

### Install and import

Install `@gcmdev/faxios` and import its default export. faxios is ESM only and needs Node 24 or later in Node.js.

```diff
- import axios from "axios";
+ import faxios from "@gcmdev/faxios";
```

### Interceptors are replaced by middleware

faxios has no `interceptors`. Register [middleware](/pages/advanced/middleware) with `.use()` instead: code before `await next(ctx)` changes the request through `ctx.config`, and code after it sees the response.

```diff
- axios.interceptors.request.use((config) => {
-   config.headers.set("X-Request-Id", crypto.randomUUID());
-   return config;
- });
+ const api = faxios.create().use(async (ctx, next) => {
+   ctx.config.headers.set("X-Request-Id", crypto.randomUUID());
+   return next(ctx);
+ });
```

Request interceptors ran in reverse registration order, so check the order when you convert more than one. See [Migrating from interceptors](/pages/advanced/migrating-from-interceptors) for response interceptors, error handlers, `runWhen`, `eject` and ordering.

### Request headers

Read and set request headers directly on `headers`, not on a `common` group:

```diff
- if (request.headers?.common?.Authorization) {
-       request.headers.common.Authorization = ...
+ if (request.headers?.Authorization) {
+       request.headers.Authorization = ...
```

Default headers can be set directly on `faxios.defaults.headers` and apply to every method. The `common`, `get`, `post`, etc. groups are still supported for method-specific defaults; a key set directly on `faxios.defaults.headers` takes precedence over the same key in a group:

```js
import faxios from "@gcmdev/faxios";

faxios.defaults.headers["Accept"] = "application/json";
```

### Multipart form data

If a request includes a `FormData` payload, `fetch` sets `Content-Type: multipart/form-data` with the boundary it encoded the body with, and faxios removes any `Content-Type` you set for it. Drop the manual header:

```diff
- axios.post("/upload", formData, {
-   headers: { "Content-Type": "multipart/form-data" },
- });
+ faxios.post("/upload", formData);
```

If you set `Content-Type: application/json` on a `FormData` body, faxios serializes it to JSON instead.

### Parameter serialization

**`params` are percent-encoded.** If your backend expected raw brackets from qs-style encoding, you may need to configure a custom serializer:

```js check=skip
import faxios from "@gcmdev/faxios";
import qs from 'qs';

faxios.create({
  paramsSerializer: {
    serialize: (params) => qs.stringify(params, { arrayFormat: 'brackets' }),
  },
});
```

**Nested objects in `params` are serialized with bracket notation** (`foo[bar]=1`) rather than dot notation. If your backend expected dot notation, use a custom serializer.

**`null` and `undefined` params are omitted.** `{ a: null, b: undefined, c: "" }` gives `?c=`.

For the full parameter serialization config options, see the [Request config](/pages/advanced/request-config) page.

### Config faxios does not support

Transport options such as `adapter`, `httpAgent`, `proxy`, `maxRedirects` and `cancelToken` are not supported: a request that passes one rejects with `ERR_BAD_OPTION`, and the message says what to use instead. See the [config reference](/pages/advanced/request-config) and the [API reference](/pages/advanced/api-reference) for what faxios supports.

### Something missing?

Should you find a difference this page does not cover, please [open an issue](https://github.com/adrianbrowning/faxios/issues/new).
