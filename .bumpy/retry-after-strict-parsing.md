---
"@gcmdev/faxios": patch
---

Fixed retry treating malformed Retry-After values such as 1.5 or -1 as past dates and retrying at once; only delta-seconds and RFC 9110 HTTP dates are honoured now.
