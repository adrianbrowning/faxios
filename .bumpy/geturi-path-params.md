---
"@gcmdev/faxios": minor
---

Breaking: Fill `{key}` placeholders from `pathParams` in `getUri()`, so it returns the URL the request sends instead of the template; a missing placeholder now throws `ERR_BAD_OPTION_VALUE`.
