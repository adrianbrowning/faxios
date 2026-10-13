---
"@gcmdev/faxios": minor
---

Add the `forwardTo` plugin (`@gcmdev/faxios/plugins/forward-to`), which sends each request to a forwarding gateway with its final URL in `X-Forward-To` (or a custom header), on every retry, and can be turned off per request with `forward: false`.
