---
"@gcmdev/faxios": patch
---

`retry` with `attemptTimeout` now passes a null-prototype `ctx.config` to the middleware after it, like every other `ctx.config`. Before, that middleware could read keys inherited from a polluted `Object.prototype`.
