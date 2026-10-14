---
"@gcmdev/faxios": patch
---

`use()` now registers a plugin's capabilities atomically. If reading a plugin's `provides` throws (for example from a getter), or a capability collides with one another plugin already provides, the instance keeps its previous capabilities and middleware, so no partial "ghost" capability blocks a later `use()` of the fixed plugin. Requests already running keep the capabilities they started with.
