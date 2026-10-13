---
"@gcmdev/faxios": minor
---

Breaking: Make `FaxiosError.toJSON()` always mask the `authorization`, `proxy-authorization`, `cookie` and `auth` config keys and strip `user:pass@` from `url` and `baseURL`; `redact` now adds keys to that default list.
