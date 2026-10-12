---
"@gcmdev/faxios": patch
---

Fixed pathParams values `.` and `..` (including percent-encoded forms like `%2e%2e`) moving the request to another path; they now reject with ERR_BAD_OPTION_VALUE.
