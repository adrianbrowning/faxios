---
"@gcmdev/faxios": patch
---

Bring the packaged `configure-requests` agent skill up to date with the surface this release ships: its import table now lists `@gcmdev/faxios/plugins/forward-to`, so an agent no longer flags a valid `forwardTo` import as unsupported, and its timeout guidance cites the file that raises `ETIMEDOUT` for the whole-request deadline. The release step now syncs the skill's `library_version` to the published version, and the skill metadata tracks the files that own the timeout, signal, unknown-option and URL-resolution rules it teaches, so a change to any of them flags the skill for review.
