---
"@gcmdev/faxios": minor
---

Breaking: Split `formToJSON` field names into nested keys only on `.` and brackets, so `first-name` and `last name` stay one key instead of nesting as `{ first: { name } }`.
