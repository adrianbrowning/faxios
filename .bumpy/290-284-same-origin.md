---
"@gcmdev/faxios": minor
---

Breaking: When faxios sets the XSRF header and the request doesn't set `fetchOptions.redirect`, it now sends the request with `redirect: "error"`, so a redirect rejects with `ERR_NETWORK` instead of carrying the token to another origin; set `fetchOptions: { redirect: "follow" }` to follow redirects you trust. `withCredentials: false` now maps to fetch `credentials: "same-origin"` instead of `"omit"`, so same-origin requests send cookies again, as with XHR and axios; only `withCredentials: true` maps to `"include"`.
