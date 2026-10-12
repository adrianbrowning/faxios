---
"@gcmdev/faxios": patch
---

Fixed the fetch adapter leaking resources: a response over maxContentLength now closes its connection, an upload stream over maxBodyLength is cancelled and unlocked, a stream response with no body (204, 304, HEAD) releases its signal listener and timer, and passing a new env.fetch on every request (as in SvelteKit) no longer grows memory.
