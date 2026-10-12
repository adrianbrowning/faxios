---
"@gcmdev/faxios": patch
---

Fixed request bodies and query params dropping keys named constructor, prototype or __proto__, and stopped a polluted Object.prototype from changing the fetch init, the transport, form serialization or the default method.
