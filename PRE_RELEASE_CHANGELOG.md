# Pre-Release Changelog

## Unreleased

## Breaking Changes

- **Custom adapter support removed:** `config.adapter` is no longer a valid config field and has been removed from `FaxiosRequestConfig`. `FaxiosAdapter`, `FaxiosAdapterConfig`, and `FaxiosAdapterName` types are gone. The `getAdapter` export has been removed from the public entry point. `fetch` is the fixed, unconditional transport — no adapter selection or custom adapter function is possible. **Note:** this explicitly reverses a decision made during the fetch-only transport migration (issue #5), where custom user-supplied adapter support was deliberately kept even as the Node `http`/`https` and browser XHR adapters were removed. The adapter-registry machinery (`getAdapter`, `knownAdapters`, `isResolvedHandle`, `buildNoAdapterMessage`) has been deleted alongside the config support.

- **Fetch-only transport:** faxios now uses the web-standard `fetch` API as its only HTTP transport in every runtime (browser, Node 18+, Deno, Bun). The Node `http`/`https` adapter and the browser `XMLHttpRequest` adapter were removed, along with the `follow-redirects`, `form-data`, `proxy-from-env`, and `https-proxy-agent` runtime dependencies and the Node platform layer. The package is ESM-only (no CJS, no UMD/CDN bundle). `onUploadProgress` is no longer supported (`fetch` cannot emit upload progress); `onDownloadProgress` still works. The following config fields were removed (type error if passed, ignored at runtime): `maxRedirects`, `maxRate`, `beforeRedirect`, `socketPath`, `allowedSocketPaths`, `transport`, `httpAgent`, `httpsAgent`, `proxy`, `decompress`, `insecureHTTPParser`, `httpVersion`, `http2Options`, `sensitiveHeaders`, `lookup`, `family`. `maxContentLength` and `maxBodyLength` are kept and enforced by the fetch adapter. Connection and transport failures now reject with code `ERR_NETWORK`, carrying the underlying OS error (e.g. `ECONNREFUSED`) on `error.cause` instead of using it as the error code. Proxy support is now configured at the `fetch` runtime level (e.g. an undici dispatcher via `fetchOptions`); faxios no longer manages proxies. (**#5**)

## Bug Fixes

- **URL Validation:** Reject malformed `http:` and `https:` URLs that omit `//` before adapter URL normalization, returning `ERR_INVALID_URL` instead of silently normalizing invalid input. (**#10900**, closes **#7315**)
- **Types:** Add the missing readonly `name: 'CanceledError'` declaration to CommonJS `CanceledError` typings to match the ESM declarations. (**#10922**)
- **Config Merge:** Added `transitional.validateStatusUndefinedResolves` (default `true`) so applications can opt into treating explicit `validateStatus: undefined` like an omitted option by setting it to `false`. `validateStatus: null` still accepts every response status. (**#10899**, closes **#6688**)

## Release Tracking

- ESM/CJS typings are updated for `transitional.validateStatusUndefinedResolves`; README/docs updates are tracked in `PRE_RELEASE_DOCS.md` for release preparation.
