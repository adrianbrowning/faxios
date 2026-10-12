---
"@gcmdev/faxios": patch
---

Fixed toFormData leaking helpers between calls, ignoring the formSerializer Blob option, and throwing uncoded errors; every toFormData failure is now a FaxiosError with a code.
