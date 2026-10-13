---
"@gcmdev/faxios": minor
---

Breaking: Remove any `Content-Type` set for a `FormData` body in every runtime, including one with a caller `boundary`, so the header always carries the boundary the body was encoded with. Node used to keep a caller boundary that didn't match the body.
