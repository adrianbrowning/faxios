---
"@gcmdev/faxios": minor
---

Breaking: require an explicit response generic to match the `responseSchema` output, so `get<{ nope: string }>(url, { responseSchema: zUser })` is a type error instead of silently retyping `response.data`. Also let schema-less `define()`/`route()` endpoints take `pathParams`, `params` and `data`, infer `define()`/`route()` output from a schema without `~standard.types`, and type `env.Response` so the global `Response` is accepted.
