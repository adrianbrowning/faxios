---
"@gcmdev/faxios": patch
---

Fixed an async-iterable request body, such as an async generator, being sent as `{}` with `Content-Type: application/json`: faxios now sends it as a stream of its chunks (string chunks are UTF-8 encoded) and sets no `Content-Type`. Like other stream bodies, it is read once: `retry` doesn't retry it, and sending it again (for example from middleware that calls `next` twice) rejects with `ERR_BAD_REQUEST`.
