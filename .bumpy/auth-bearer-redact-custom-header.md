---
"@gcmdev/faxios": patch
---

`authBearer` with a custom `header` now adds that header to the request's `redact` list, so `error.toJSON()` masks the key, as it masks `Authorization`. Before, the key showed in plain text in serialized errors.
