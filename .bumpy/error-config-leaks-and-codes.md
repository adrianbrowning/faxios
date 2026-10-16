---
"@gcmdev/faxios": minor
---

Breaking: two error codes change. A `responseType: "formdata"` body that can't be parsed rejects with `ERR_BAD_RESPONSE` instead of `ERR_NETWORK`, so `retry` no longer retries it. A response stream chunk that isn't bytes rejects with `ERR_BAD_RESPONSE` (was `ERR_BAD_REQUEST`) and carries `error.config`. If you match those codes, check `ERR_BAD_RESPONSE` instead. The XSRF token is set on a copy of the request headers, so `error.config.headers` and `error.toJSON()` no longer carry it. Error messages (and `timing` plugin errors) strip user info through the last `@`, so `https://user:p@ss@host` no longer leaves `ss@` behind. A `responseType: "stream"` body is cancelled when a custom `transformResponse` throws, instead of holding the request open until its signal aborts.
