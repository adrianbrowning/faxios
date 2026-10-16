---
"@gcmdev/faxios": minor
---

Breaking: `new CanceledError(message, config)` and `canceledFromSignal(signal, config)` now type `config` as `InternalFaxiosRequestConfig` (the type `error.config` already claimed), so a plain request config with object headers no longer type-checks there; pass the config faxios hands you, such as `ctx.config`. `unsafe/core/buildFullPath.js` now takes `string | undefined` URLs and returns `string | undefined` instead of passing other values through typed as `string`. A truthy non-string `baseURL` now rejects with `ERR_BAD_OPTION_VALUE` instead of a `TypeError`.
