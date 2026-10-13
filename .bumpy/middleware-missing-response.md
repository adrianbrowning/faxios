---
"@gcmdev/faxios": patch
---

Fixed a middleware that forgets to return next(ctx) crashing later with a TypeError; the request now rejects with an ERR_BAD_RESPONSE FaxiosError that names the cause.
