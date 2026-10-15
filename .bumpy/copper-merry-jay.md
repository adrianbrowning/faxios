---
"@gcmdev/faxios": patch
---

Named imports from the package root no longer keep the whole library in a bundle: `import { isCancel } from "@gcmdev/faxios"` now bundles to a few bytes instead of about 55 KB, and `import { retry } from "@gcmdev/faxios/plugins/retry"` no longer pulls in the request pipeline (about 16 KB instead of 60 KB). Importing faxios no longer probes the runtime's `Request` and `Response`; the first request does it.
