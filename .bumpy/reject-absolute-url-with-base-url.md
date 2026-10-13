---
"@gcmdev/faxios": minor
---

Breaking: Reject an absolute URL on an instance with a `baseURL` with `ERR_INVALID_URL` unless `allowAbsoluteUrls` is `true`, instead of appending it to the base; `getUri()` throws the same error.
