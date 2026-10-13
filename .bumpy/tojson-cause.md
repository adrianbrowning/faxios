---
"@gcmdev/faxios": minor
---

Add `cause` to `FaxiosError.toJSON()`: the wrapped error chain as `{ name, code, message, cause }`, without any config, so a logged network failure names the underlying error. URL user info is stripped from the serialized `message`, `stack` and cause messages.
