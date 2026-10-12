---
"@gcmdev/faxios": patch
---

Fixed `responseType: "stream"` so an errored or cancelled body aborts the request and releases its connection, while `timeout` and `signal` keep applying until the body is fully read or cancelled.
