---
"@gcmdev/faxios": minor
---

Breaking: Merge request headers above instance headers in every group (instance `common` < instance method < instance top-level < request `common` < request method < request top-level), and treat an own `undefined` request option as unset on `request()` and every method alias, so `{ timeout: undefined }` or `{ baseURL: undefined }` keeps the instance value; only `xsrfCookieName` and `xsrfHeaderName` are still cleared by `undefined`. `transitional.validateStatusUndefinedResolves` now defaults to `false`, so `validateStatus: undefined` rejects non-2xx; pass `validateStatus: null` to resolve every status.
