---
"@gcmdev/faxios": minor
---

Breaking: Change `TimingEvent.error` from the raw thrown error to `{ code, message, status }`, and strip `user:pass@` from the reported `url`, so a timing event never carries the request config, headers or URL credentials.
