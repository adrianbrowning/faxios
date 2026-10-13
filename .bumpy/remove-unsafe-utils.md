---
"@gcmdev/faxios": minor
---

Breaking: Remove the `@gcmdev/faxios/unsafe/utils.js` subpath, and give a custom `toFormData` visitor only the declared `convertValue`, `defaultVisitor` and `isVisitable` helpers instead of every internal `is*` predicate. A `maxContentLength` or `maxBodyLength` error raised before the request is sent now carries the `Request` on `error.request`, and importing faxios no longer adds a `message` listener in browsers without `setImmediate`.
