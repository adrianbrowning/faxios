---
"@gcmdev/faxios": patch
---

Fixed config merging: request(url, config) no longer writes url into your config, route() method configs now merge headers and nested options with the route config, and headers literally named like a method group (such as get or common) are sent instead of dropped.
