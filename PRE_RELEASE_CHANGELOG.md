# Pre-Release Changelog

## Unreleased

### Breaking Changes

- **`paramsSerializer.encode` now takes and returns `string`:** `ParamEncoder` is typed `(value: string, defaultEncoder: (value: string) => string) => string` instead of `unknown` in and out. Runtime behavior is unchanged. Encoders that returned a non-string always produced `"undefined"` or `"[object Object]"` in the query string, and they are now type errors. Migration: return a string from your encoder, e.g. `encode: (v, d) => d(v)` or `encode: encodeURIComponent`.
