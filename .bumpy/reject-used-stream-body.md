---
"@gcmdev/faxios": patch
---

Fixed sending a stream request body a second time, for example from middleware that calls next() again: it now rejects with a FaxiosError coded ERR_BAD_REQUEST instead of an uncoded TypeError or an empty body.
