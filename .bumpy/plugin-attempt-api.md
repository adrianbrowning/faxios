---
"@gcmdev/faxios": minor
---

Breaking: Add `ctx.attempt`, the try number on the middleware context (1 for every request), which `retry` and hand-written retry middleware set before each try and `timing` reports, so `TimingEvent.attempt` is now always present (1 without `retry`). The built-in plugins now import only the package root (which now also exports the `FaxiosPluginOptionNames` type) and no longer share a private symbol on `ctx.state`.
