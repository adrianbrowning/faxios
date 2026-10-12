---
"@gcmdev/faxios": patch
---

Fixed web `ReadableStream` request bodies wrapped for `onUploadProgress` or `maxBodyLength`: typed-array chunks such as `Uint16Array` now send all their bytes and string chunks are UTF-8 encoded instead of arriving empty; other chunk types reject with `ERR_BAD_REQUEST`. Tracked streams also stop copying each chunk, and response headers are parsed once with constant-time header lookups.
