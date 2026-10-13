---
"@gcmdev/faxios": patch
---

Fixed transport failures rejecting without a code: a URL fetch can't parse rejects with ERR_INVALID_URL (with a hint that relative URLs need a baseURL outside the browser), a request the runtime refuses to build rejects with ERR_BAD_REQUEST, and a response body that fails mid-read rejects with ERR_NETWORK.
