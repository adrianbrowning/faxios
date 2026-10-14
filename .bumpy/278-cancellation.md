---
"@gcmdev/faxios": minor
---

Breaking: `GenericAbortSignal` now requires `addEventListener` and `removeEventListener`, and a `signal` without them (such as `{ aborted: false }`) rejects with an `ERR_BAD_OPTION_VALUE` `FaxiosError` before middleware runs, instead of a raw `TypeError` or being silently ignored when `timeout` is set. A request with a long-lived caller `signal` and a `timeout` (and each `retry` try with `attemptTimeout`) no longer stays linked to that signal after it settles, so reusing one signal for many requests no longer grows memory. A `responseType: "stream"` body behind `retry({ attemptTimeout })` now stays under the request's `timeout` and `signal` until it is read or cancelled, so a stalled body rejects with `ETIMEDOUT` instead of hanging.
