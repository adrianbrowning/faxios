---
"@gcmdev/faxios": minor
---

Breaking: In a browser, `authBearer` with `header: "Cookie"` now rejects with `ERR_BAD_OPTION_VALUE` before sending, instead of sending the request without the cookie, which fetch drops. Use `withCredentials` to send the browser's own cookies.
