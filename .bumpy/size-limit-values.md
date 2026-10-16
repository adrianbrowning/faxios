---
"@gcmdev/faxios": minor
---

Breaking: `maxContentLength` and `maxBodyLength` now take only `-1` (unlimited) or a finite number of bytes from `0`. Any other value, such as a string like `"1048576"`, `NaN`, `Infinity`, `null` or a negative number other than `-1`, rejects with `ERR_BAD_OPTION_VALUE` before the request is sent. Before, these values switched the size check off without an error. If you read a limit from an environment variable, convert it with `Number()` first.
