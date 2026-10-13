---
"@gcmdev/faxios": minor
---

Breaking: Reject npm `form-data` package bodies (objects with `getHeaders()`) with `ERR_NOT_SUPPORT` before sending, instead of sending the text `[object FormData]`, and remove the `formDataHeaderPolicy` option. Use the runtime's global `FormData`.
