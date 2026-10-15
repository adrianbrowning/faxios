---
"@gcmdev/faxios": patch
---

Bring the packaged `configure-requests` agent skill up to date with 0.2.4: its import table now lists `@gcmdev/faxios/plugins/forward-to`, so an agent no longer flags a valid `forwardTo` import as unsupported, and its timeout guidance cites the file that raises `ETIMEDOUT` for the whole-request deadline. The skill metadata now names version 0.2.4 and tracks the files that own the timeout, signal, unknown-option and URL-resolution rules it teaches, so a change to any of them flags the skill for review.
