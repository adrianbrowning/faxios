---
"@gcmdev/faxios": minor
---

New `authenticate` plugin (`@gcmdev/faxios/plugins/authenticate`): `authenticate(getCredentials, { origins, overwrite })` sends `{ headers, query, cookies }` from one callback, asked for on every request and try, to your API's origin only, by the same rule as `authBearer`. Query parameters are added to `params` and masked in `error.toJSON()`; cookies go in one `Cookie` header on Node, Deno and Bun. Any header but `Authorization`, and any cookie, refuses redirects unless the request sets `redirect`. `authBearer` is now `authenticate` with one header. In a browser, which drops a `Cookie` header a request sets, cookie credentials and `authBearer` with `header: "Cookie"` now reject with `ERR_BAD_OPTION_VALUE` instead of sending the request without them.
