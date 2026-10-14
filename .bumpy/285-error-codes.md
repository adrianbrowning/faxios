---
"@gcmdev/faxios": patch
---

Fixed transport failures on Deno and Bun missing `ERR_NETWORK`: any error `fetch` rejects with while sending is now `ERR_NETWORK` with the runtime's error on `error.cause`, whatever its message or code, so the default `retry()` predicate retries a refused connection on every runtime. An unparseable URL now rejects with `ERR_INVALID_URL` also when `onUploadProgress` or `maxBodyLength` is set, and a request with neither `url` nor `baseURL` rejects with `ERR_INVALID_URL` instead of a code-less `TypeError`. With `responseType: "json"`, a 4xx or 5xx response whose body isn't JSON now rejects with its status error (`Request failed with status code N`, `ERR_BAD_REQUEST` or `ERR_BAD_RESPONSE`), keeps the raw body on `error.response.data` and puts the parse error on `error.cause`.
