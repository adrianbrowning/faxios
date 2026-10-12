---
"@gcmdev/faxios": patch
---

Fixed a null or non-object config, a non-string or invalid method, and a url that isn't a string or URL rejecting with an uncoded error; they now reject with ERR_BAD_OPTION_VALUE, and a URL instance is sent as documented.
