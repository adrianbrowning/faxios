---
"@gcmdev/faxios": minor
---

Breaking: the `retry` plugin's `attempts` must now be an integer from 1 to 10, in the plugin options and in a per-request `retry` override alike; 11 or more rejects with `ERR_BAD_OPTION_VALUE` before a request is sent, so one call can't turn into a flood of tries against a failing server. `maxContentLength` is now enforced on the read body whenever the counting stream wrapper didn't apply, so an `env.fetch` that returns a Response-like value without a stream `body` no longer bypasses it in runtimes with stream responses. String bodies, `FormData` string values and string responses are measured in UTF-8 bytes without encoding a copy, so checking an oversized body against `maxBodyLength` or `maxContentLength` no longer allocates a buffer as large as the body.
