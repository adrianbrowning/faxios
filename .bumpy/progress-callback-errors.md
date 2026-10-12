---
"@gcmdev/faxios": patch
---

Fixed an error thrown by onUploadProgress or onDownloadProgress becoming an uncaught exception; it is now caught and ignored and the request settles normally.
