---
"@gcmdev/faxios": minor
---

Breaking: type `response.headers`, `ctx.config.headers` and the transformer `headers` argument as `FaxiosHeaders`, so `has()`, `getSetCookie()`, the shortcuts and `for...of` work without a cast, and remove the `FaxiosResponseHeadersLike` and `FaxiosRequestHeaders` types (import `FaxiosHeaders` instead). The `get<Header>` shortcuts now take the parsers `get()` takes and return matching types, so passing a string such as `getContentType("application/json")`, which always threw at runtime, is a type error.
