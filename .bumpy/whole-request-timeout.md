---
"@gcmdev/faxios": minor
---

Breaking: Make `timeout` bound the whole request (middleware, schemas, every `retry` try and wait, the fetch and a streamed body) from when it starts, instead of one fetch call; a timed-out request is no longer retried, and changing `ctx.config.timeout` in middleware has no effect. Add `retry({ attemptTimeout })` to limit each try, which then rejects with `ETIMEDOUT` and is retried.
