---
"@gcmdev/faxios": minor
---

Breaking: `getUri()` throws a `FaxiosError` with `ERR_INVALID_URL` for a config with neither `url` nor `baseURL`, where it returned `undefined`. `post`, `put`, `patch`, `query`, `postForm`, `putForm` and `patchForm` now send headers given as a `Headers`, a `Map` or `[name, value]` pairs, which they dropped, and `create({ headers })` with one of those keeps the inherited `common` and method groups and `defaults.headers.common`. The exported `mergeConfig` merges `headers` given in those forms the same way, and the result's `headers` is a plain object. A `responseType: "stream"` body stays under the request's `timeout` and signal when middleware passes `next` a context with a new `ctx.state`, or a context rebuilt from its fields. A request that sends the XSRF header, or a custom `authBearer` header, refuses redirects when `fetchOptions.redirect` is an own `undefined`, as it does when the key is missing.

The retry plugin now rejects a signal without an `aborted` flag with `ERR_BAD_OPTION_VALUE`, as a request does.
