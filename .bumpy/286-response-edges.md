---
"@gcmdev/faxios": patch
---

Fixed four response edge cases. With `responseType: "stream"`, a 4xx or 5xx response no longer errors its body: `error.response.data` is a readable stream with the server's error body, and the request's `timeout` and `signal` govern it until it is read or cancelled, as for a 2xx body; `retry` cancels the body of a status error it retries, or drops because `onRetry` or `delay` threw. `maxContentLength` no longer rejects a `HEAD`, `204`, `205` or `304` response for the `Content-Length` it declares, since those carry no body. `responseType: "JSON"` (any case) now parses JSON like `"json"`, including its strict-JSON errors. A `ReadableStream` body counts as sent only when `fetch` is called, so middleware that calls `next()` again after a try that failed before sending can send the unread stream.
