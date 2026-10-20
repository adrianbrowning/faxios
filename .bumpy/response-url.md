---
"@gcmdev/faxios": minor
---

New `response.redirected` and `response.url`: whether fetch followed a redirect, and the URL that sent the response. Each is `undefined` when the runtime or a custom `fetch` doesn't report it, such as a hand-built `Response`. `refreshAuth` uses them: a 401 from a host the API redirected to doesn't trigger a refresh.
