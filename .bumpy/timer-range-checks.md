---
"@gcmdev/faxios": patch
---

Fixed `timeout` values below 0 or above 2147483647 ms timing out at once, and retry `maxDelay` / `maxRetryAfter` values above 2147483647 ms retrying at once; they now reject with `ERR_BAD_OPTION_VALUE` naming the option.
