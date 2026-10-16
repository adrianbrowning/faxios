---
"@gcmdev/faxios": patch
---

Fixed `error.config` on errors a request or `getUri()` throws before it is sent (an unknown option, a bad `method`, `url`, `responseType`, `transitional` or size limit): `headers` is now the `FaxiosHeaders` the request would send, where it was missing before, and on a bad `method` a `URL` url is its `href`. `resolveRequestURL()` now rejects a `url` that isn't a string or `URL` with `ERR_BAD_OPTION_VALUE` ("option url must be a string or URL"), the error the request itself rejects with, instead of `ERR_INVALID_URL`; this includes a url middleware sets to a non-string.
