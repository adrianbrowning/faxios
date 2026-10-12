---
"@gcmdev/faxios": patch
---

Fixed authBearer sending `Bearer null` or an empty token: when getToken returns anything other than a non-empty string, the request is sent without the auth header.
