---
"@gcmdev/faxios": minor
---

New `authenticate` plugin (`@gcmdev/faxios/plugins/authenticate`): `authenticate(getCredentials, { origins, overwrite })` sends `{ headers, query, cookies }` from one callback, asked for on every request and try, to your API's origin only, by the same rule as `authBearer`. Query parameters are added to `params` and masked in `error.toJSON()`; cookies go in one `Cookie` header on Node, Deno and Bun. Any header but `Authorization`, any cookie, and any query parameter refuses redirects unless the request sets `redirect`. Query credentials go into `params` before `paramsSchema` runs, so the schema must accept their names. Types: `AuthenticateOptions`, `AuthenticateCredentials`, `AuthenticateCredentialValues`. `authBearer` is now `authenticate` with one header. In a browser, which drops a `Cookie` header a request sets, cookie credentials reject with `ERR_BAD_OPTION_VALUE`.
