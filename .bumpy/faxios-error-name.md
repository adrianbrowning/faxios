---
"@gcmdev/faxios": minor
---

Breaking: Keep `name` as `"FaxiosError"` on every error `FaxiosError.from()` wraps (a `TypeError` from fetch, a `SyntaxError` from JSON parsing); the wrapped error and its own name stay on `error.cause`.
