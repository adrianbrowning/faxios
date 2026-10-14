---
"@gcmdev/faxios": patch
---

Correct the packaged agent skill and option docs: the skill no longer tells agents to import `spread` by name (it is only on the default export), and says `pathParams` is required when `pathParamsSchema` is set and optional otherwise. The docs now say `transformRequest` runs for every method, list `QUERY` among body-carrying methods, describe `forcedJSONParsing` as parsing JSON only when `responseType` is unset, and use `ETIMEDOUT` as the example timeout code.
