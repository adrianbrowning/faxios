---
"@gcmdev/faxios": patch
---

`FaxiosHeaders` now skips the header names `__proto__`, `constructor` and `prototype`, so a header map from `JSON.parse` with an own `__proto__` key no longer replaces the prototype of the headers object and its other headers are kept. Parsed response headers keep names that exist on `Object.prototype`, such as `ToString` or `ValueOf`, instead of dropping them. The built-in `authBearer` and `forwardTo` plugins now pass a null-prototype `ctx.config` (and `env` for `forwardTo`) to the middleware after them.
