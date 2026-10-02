# Pre-Release Changelog

## Unreleased

### Breaking Changes

- **`paramsSerializer.encode` now takes and returns `string`:** `ParamEncoder` is typed `(value: string, defaultEncoder: (value: string) => string) => string` instead of `unknown` in and out. Runtime behavior is unchanged. Encoders that returned a non-string always produced `"undefined"` or `"[object Object]"` in the query string, and they are now type errors. Migration: return a string from your encoder, e.g. `encode: (v, d) => d(v)` or `encode: encodeURIComponent`.
- **Request `headers` are strictly typed, with autocomplete:** `headers` on every request config, method alias, `create()`, `define()` and `route()` is now `FaxiosConfigHeaders` instead of `Record<string, unknown>`. It accepts a flat header bag, method header groups (`common`, `get`, `post`, …), both mixed in one object, or a `FaxiosHeaders` instance. Editors suggest common header names and `Content-Type` values, and any other name or MIME string is still accepted. Header values must be `string`, `number`, `string[]`, `boolean`, `null` or `undefined`; objects and functions are now type errors. Runtime behavior is unchanged. Migration: convert other values yourself, e.g. `"X-Id": String(id)`. `FaxiosConfigHeaders`, `RawFaxiosRequestHeaders` and `HeadersDefaults` are now exported, `Location` is no longer a suggested request header, and `CreateFaxiosDefaults` is now the same type as `FaxiosRequestConfig`.

### Features

- **`isSchemaValidationError` narrows by error code:** the guard now returns `SchemaValidationError`, a union discriminated on `code`. After `err.code === FaxiosError.ERR_BAD_RESPONSE_SCHEMA`, `err.response` is required, and `err.response.data` holds the body the schema rejected (after `transformResponse`, before validation) as `unknown`. For the request, params and path-params codes, `response` stays optional. `code` is now typed as the four schema codes instead of `string | undefined`. At runtime the guard also returns `false` for an `ERR_BAD_RESPONSE_SCHEMA` error unless its `response` has `data`, a numeric `status`, a string `statusText`, and object `headers` and `config`. Errors thrown by faxios always pass. `SchemaValidationError` is exported. (**#53**)

### Fixes

- **`options`, `purge`, `link` and `unlink` header groups no longer leak onto the wire:** these method header groups were applied correctly but never removed, so every request also sent a literal header such as `options: [object Object]`. All twelve method header groups are now stripped before the request is sent.

### Documentation

- **Docs site on GitHub Pages:** the documentation now lives at https://adrianbrowning.github.io/faxios/ and deploys when a release is published. The npm README is a short overview that links to it, and `homepage` in `package.json` points there. The site is English-only for now. It adds pages for `define()`, `route()` and schema validation, removes the Adapters page and `adapter` option (faxios has no adapter selection), and replaces the `axios-mock-adapter` testing guidance with mocking through `env.fetch`. (**#26**)
