---
"@gcmdev/faxios": minor
---

Breaking: Default `fetchOptions.redirect` to `"error"` when `authBearer` sets a custom `header`, unless the request sets `redirect`, so a redirect can no longer carry the key to another host.
