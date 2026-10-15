---
"@gcmdev/faxios": minor
---

Breaking: `timeout` must be a number. A numeric string (`"30"`), `true`, `" "` or `[]` now rejects with `ERR_BAD_OPTION_VALUE` instead of being converted with `Number()`; `undefined` and `null` still mean no timeout.
