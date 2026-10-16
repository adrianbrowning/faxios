---
"@gcmdev/faxios": patch
---

Correct the docs inherited from axios: faxios needs Node.js 24 or later (the 0.1.0 notes said Node 18+), `onUploadProgress` works in Node.js (the 0.1.0 notes said it was removed), `maxContentLength` and `maxBodyLength` default to `-1`, and `null` params are dropped. `MIGRATION_GUIDE.md` covers moving from axios to faxios and, in a new "Upgrading from faxios 0.2" section, the breaking changes in 0.3.0; the upgrade page is "Coming from axios", the README names every supported runtime, and the unused `ECOSYSTEM.md`, examples and sandbox are removed.
