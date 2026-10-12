---
"@gcmdev/faxios": patch
---

Fixed onDownloadProgress reporting 100% after the first chunk of a compressed response; total is now undefined and lengthComputable false when Content-Encoding is set.
