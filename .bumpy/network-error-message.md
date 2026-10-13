---
"@gcmdev/faxios": minor
---

Breaking: Name the underlying reason and the request in network error messages, such as `Network Error: ECONNREFUSED (GET https://host/path)`, instead of a bare `Network Error`; the URL drops its user info, query and fragment.
