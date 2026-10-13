---
"@gcmdev/faxios": minor
---

Breaking: Reject a body that is not valid JSON with `ERR_BAD_RESPONSE` whenever `responseType` is `"json"`, and remove `transitional.silentJSONParsing`, which now rejects with `ERR_BAD_OPTION`; leave `responseType` unset to keep the raw string.
