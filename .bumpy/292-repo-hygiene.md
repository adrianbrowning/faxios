---
"@gcmdev/faxios": patch
---

Drop the `engines.pnpm` requirement and the axios-era `contributors` list from the published manifest, so pnpm 8 and 9 installs no longer warn or fail under `engine-strict`. The bundled `configure-requests` skill now uses `https://api.example.com` with a neutral path in its `define()` example instead of a real vendor CDN.
