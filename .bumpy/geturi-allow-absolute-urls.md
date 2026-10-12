---
"@gcmdev/faxios": patch
---

Fixed getUri() ignoring allowAbsoluteUrls, so on an instance with baseURL it now returns the same URL the request is sent to.
