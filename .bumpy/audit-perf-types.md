---
"@gcmdev/faxios": patch
---

The method aliases (`get`, `post`, `postForm`, ...) merge the request config once, in `request()`, instead of twice. Repeated header names from an iterable are collected without copying the array on each repeat, and the data-URL size estimate no longer allocates per character. `GenericAbortSignal` declares `addEventListener` and `removeEventListener` as methods, so a polyfill typed `addEventListener(type: "abort", …)` is accepted. `FormDataVisitorHelpers` and `SerializerVisitor` are exported as types from the package root.
