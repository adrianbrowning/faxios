---
"@gcmdev/faxios": patch
---

Fixed basic auth with a non-ASCII username throwing InvalidCharacterError; the Authorization header is now built once and UTF-8 encodes both username and password.
