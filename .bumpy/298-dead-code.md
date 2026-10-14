---
"@gcmdev/faxios": minor
---

Breaking: unused legacy API is removed. `FaxiosHeaders.accessor()` is gone; the built-in `get`/`set`/`has` shortcuts (`getContentType()` and the rest) are still there. `FaxiosError.ECONNREFUSED` and `FaxiosError.ERR_FR_TOO_MANY_REDIRECTS` (never raised), the legacy browser fields `description`, `number`, `fileName`, `lineNumber`, `columnNumber` and `event` (and their `toJSON()` keys), and the `customProps` argument of `FaxiosError.from()` are removed. Progress events no longer have an `event` key. React Native support code is removed, including `utils.isReactNative` and `utils.isReactNativeBlob` from the `@gcmdev/faxios/unsafe/utils.js` subpath; that subpath's `utils.merge` also drops its `skipUndefined` option. A strict-JSON parse failure still rejects with `ERR_BAD_RESPONSE`, `error.response` and `error.status`, but the default `transformResponse` now throws the bare `SyntaxError` when called on its own; faxios builds the `FaxiosError` around it.
