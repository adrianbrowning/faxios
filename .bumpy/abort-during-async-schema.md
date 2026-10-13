---
"@gcmdev/faxios": patch
---

Fixed an abort during an async `requestSchema` or `paramsSchema` waiting for the schema to finish when the instance has no middleware; the request now rejects with `ERR_CANCELED` at once and sends nothing.
