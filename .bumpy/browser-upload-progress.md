---
"@gcmdev/faxios": patch
---

Fixed uploads with onUploadProgress failing with ERR_NETWORK in Chromium and WebKit: browsers now send the body unwrapped and don't call onUploadProgress, and a FormData body is no longer read into memory to measure it.
