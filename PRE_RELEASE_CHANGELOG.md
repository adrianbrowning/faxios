# Pre-Release Changelog

## Unreleased

### Breaking Changes

- **`paramsSerializer.encode` now takes and returns `string`:** `ParamEncoder` is typed `(value: string, defaultEncoder: (value: string) => string) => string` instead of `unknown` in and out. Runtime behavior is unchanged. Encoders that returned a non-string always produced `"undefined"` or `"[object Object]"` in the query string, and they are now type errors. Migration: return a string from your encoder, e.g. `encode: (v, d) => d(v)` or `encode: encodeURIComponent`.
- **Request `headers` are strictly typed, with autocomplete:** `headers` on every request config, method alias, `create()`, `define()` and `route()` is now `FaxiosConfigHeaders` instead of `Record<string, unknown>`. It accepts a flat header bag, method header groups (`common`, `get`, `post`, …), both mixed in one object, or a `FaxiosHeaders` instance. Editors suggest common header names and `Content-Type` values, and any other name or MIME string is still accepted. Header values must be `string`, `number`, `string[]`, `boolean`, `null` or `undefined`; objects and functions are now type errors. Runtime behavior is unchanged. Migration: convert other values yourself, e.g. `"X-Id": String(id)`. `FaxiosConfigHeaders`, `RawFaxiosRequestHeaders` and `HeadersDefaults` are now exported, `Location` is no longer a suggested request header, and `CreateFaxiosDefaults` is now the same type as `FaxiosRequestConfig`.

### Fixes

- **`options`, `purge`, `link` and `unlink` header groups no longer leak onto the wire:** these method header groups were applied correctly but never removed, so every request also sent a literal header such as `options: [object Object]`. All twelve method header groups are now stripped before the request is sent.
