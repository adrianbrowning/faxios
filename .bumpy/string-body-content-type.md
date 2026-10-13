---
"@gcmdev/faxios": minor
---

Breaking: Stop setting `application/x-www-form-urlencoded` on plain string bodies. `fetch` now sends them as `text/plain;charset=UTF-8`, also with `onUploadProgress`; set `Content-Type` or pass a `URLSearchParams` if your server expects a urlencoded string.
