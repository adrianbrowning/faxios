---
"@gcmdev/faxios": patch
---

A schema whose `validate()` returns `issues` that isn't an array, such as `issues: null`, now rejects with the request's schema error code (for example `ERR_BAD_PARAMS_SCHEMA`) and the "returned a non-Result value" message, instead of a plain `TypeError`.
