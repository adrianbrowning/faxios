---
"@gcmdev/faxios": minor
---

New `refreshAuth` plugin (`@gcmdev/faxios/plugins/refresh-auth`): `refreshAuth(refresh, { statuses, shouldRefresh, origins })` runs `refresh` when a request to your API fails with a 401, then sends the request again once, any method, so `authenticate` or `authBearer` installed after it puts the new credentials on the second try. Concurrent 401s share one `refresh` call, a request sent before the last refresh finished is retried without another one, and a 401 from another origin never triggers one. A request whose signal aborts while it waits rejects with `CanceledError` at once. `refreshAuth: false` on a request (such as the refresh call itself) sends it without refreshing.
