---
"@gcmdev/faxios": patch
---

Fixed Deno types for isFaxiosError, isCancel, mergeConfig, CanceledError, Faxios, toFormData, HttpStatusCode, VERSION and the unsafe/* exports, which Deno read as any or loose JS types instead of the shipped .d.ts.
