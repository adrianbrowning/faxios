---
"@gcmdev/faxios": patch
---

Fixed formDataToJSON dropping non-ASCII field names, so fields like 名前 and 姓 now map to their own keys instead of merging under "undefined".
