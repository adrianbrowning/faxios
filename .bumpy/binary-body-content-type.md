---
"@gcmdev/faxios": patch
---

Fixed Blob, File, ArrayBuffer, typed-array and stream request bodies being sent with Content-Type application/x-www-form-urlencoded; the runtime now uses Blob.type or sends no Content-Type.
