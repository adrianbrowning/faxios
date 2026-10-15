---
"@gcmdev/faxios": minor
---

Breaking: unused legacy API is removed. `FaxiosHeaders.accessor()` is gone; the built-in `get`/`set`/`has` shortcuts (`getContentType()` and the rest) are still there. `FaxiosError.ECONNREFUSED` and `FaxiosError.ERR_FR_TOO_MANY_REDIRECTS` (never raised) (to detect a refused connection or a redirect loop, check `err.code === "ERR_NETWORK"` and read the transport error on `err.cause`), the legacy browser fields `description`, `number`, `fileName`, `lineNumber`, `columnNumber` and `event` (and their `toJSON()` keys), and the `customProps` argument of `FaxiosError.from()` are removed. Progress events no longer have an `event` key. React Native support code is removed. A strict-JSON parse failure still rejects with `ERR_BAD_RESPONSE`, `error.response` and `error.status`, but the default `transformResponse` now throws the bare `SyntaxError` when called on its own; faxios builds the `FaxiosError` around it.
