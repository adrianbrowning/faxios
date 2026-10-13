---
"@gcmdev/faxios": patch
---

Fixed `controller.abort(reason)` losing the reason: every `CanceledError` now takes its message from an `Error` or string reason and keeps an `Error` reason as `cause`, at every stage of the request.
