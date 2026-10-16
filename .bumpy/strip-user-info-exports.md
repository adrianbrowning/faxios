---
"@gcmdev/faxios": minor
---

The package root now exports `stripUserInfo` and `stripUserInfoInText`, so plugins remove URL user info (`user:pass@`) with core's rules instead of copying its regexes: `stripUserInfo` from a URL, `stripUserInfoInText` from free text such as an error message. `FaxiosError#toJSON()` and the `timing` plugin use them.
