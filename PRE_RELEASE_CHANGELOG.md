# Pre-Release Changelog

## Unreleased

## Breaking Changes

- **Custom adapter support removed:** `config.adapter` is no longer a valid config field and has been removed from `FaxiosRequestConfig`. `FaxiosAdapter`, `FaxiosAdapterConfig`, and `FaxiosAdapterName` types are gone. The `getAdapter` export has been removed from the public entry point. `fetch` is the fixed, unconditional transport — no adapter selection or custom adapter function is possible. **Note:** this explicitly reverses a decision made during the fetch-only transport migration (issue #5), where custom user-supplied adapter support was deliberately kept even as the Node `http`/`https` and browser XHR adapters were removed. The adapter-registry machinery (`getAdapter`, `knownAdapters`, `isResolvedHandle`, `buildNoAdapterMessage`) has been deleted alongside the config support.

- **Fetch-only transport:** faxios now uses the web-standard `fetch` API as its only HTTP transport in every runtime (browser, Node 18+, Deno, Bun). The Node `http`/`https` adapter and the browser `XMLHttpRequest` adapter were removed, along with the `follow-redirects`, `form-data`, `proxy-from-env`, and `https-proxy-agent` runtime dependencies and the Node platform layer. The package is ESM-only (no CJS, no UMD/CDN bundle). `onUploadProgress` is no longer supported (`fetch` cannot emit upload progress); `onDownloadProgress` still works. The following config fields were removed (type error if passed, ignored at runtime): `maxRedirects`, `maxRate`, `beforeRedirect`, `socketPath`, `allowedSocketPaths`, `transport`, `httpAgent`, `httpsAgent`, `proxy`, `decompress`, `insecureHTTPParser`, `httpVersion`, `http2Options`, `sensitiveHeaders`, `lookup`, `family`. `maxContentLength` and `maxBodyLength` are kept and enforced by the fetch adapter. Connection and transport failures now reject with code `ERR_NETWORK`, carrying the underlying OS error (e.g. `ECONNREFUSED`) on `error.cause` instead of using it as the error code. Proxy support is now configured at the `fetch` runtime level (e.g. an undici dispatcher via `fetchOptions`); faxios no longer manages proxies. (**#5**)

- **`allowAbsoluteUrls` defaults to `false` when `baseURL` is set:** Previously `allowAbsoluteUrls` defaulted to `true` regardless of `baseURL`. It now defaults to `false` when a `baseURL` is configured (`config.allowAbsoluteUrls = defaults.allowAbsoluteUrls ?? !defaults.baseURL`). Instances that set `baseURL` and pass absolute URLs in per-request config will have those URLs rejected unless `allowAbsoluteUrls: true` is explicitly set.

- **`CancelToken` removed:** The `CancelToken` API has been deleted. **Migration:** replace `CancelToken.source()` + `cancelToken` config field with the web-standard `AbortController` + `signal` config field:
  ```js
  // before
  const source = CancelToken.source();
  faxios.get('/path', { cancelToken: source.token });
  source.cancel('reason');

  // after
  const controller = new AbortController();
  faxios.get('/path', { signal: controller.signal });
  controller.abort('reason');
  ```

- **`spread` and `bind` helpers removed:** `lib/helpers/spread.js` and `lib/helpers/bind.js` have been deleted and are no longer exported from the package entry point. Use native `Function.prototype.apply` / `Function.prototype.bind` directly.

## Features

- **Standard Schema response validation:** New `responseSchema` config field accepts any [Standard Schema v1](https://standardschema.dev) compliant schema (Zod, Valibot, ArkType, etc.). When set, `response.data` is validated after `transformResponse` — on success, `response.data` is replaced with the schema's parsed output; on failure, a `FaxiosError` with code `ERR_BAD_RESPONSE_SCHEMA` is thrown carrying the schema's `issues` array. New `isSchemaValidationError()` type guard exported for narrowing caught errors. TypeScript infers `response.data` from the schema's output type automatically. (**#4**)

- **Standard Schema request validation:** New `requestSchema` config field validates `config.data` before sending. On failure, throws `FaxiosError` with code `ERR_BAD_REQUEST_SCHEMA`. (**#5**)

- **Standard Schema params validation:** New `paramsSchema` config field validates `config.params` before URL construction. On failure, throws `FaxiosError` with code `ERR_BAD_PARAMS_SCHEMA`. Validates even when `params` is undefined (schemas may enforce required fields). (**#5**)

- **Path params URL templating:** New `pathParams` config field substitutes `{key}` placeholders in URLs. New `pathParamsSchema` config field validates path params before substitution; throws `ERR_BAD_PATH_PARAMS_SCHEMA` on failure. When `pathParamsSchema` is configured, `pathParams` is required. (**#5**)

- **`faxios.define()` typed endpoint builder:** New `faxios.define(method, url, config)` creates a reusable, fully-typed endpoint function. Schemas set at define-time cannot be overridden per-call (security by design). TypeScript infers required/optional call arguments from schema presence. (**#5**)

## Bug Fixes

- **URL Validation:** Reject malformed `http:` and `https:` URLs that omit `//` before adapter URL normalization, returning `ERR_INVALID_URL` instead of silently normalizing invalid input. (**#10900**, closes **#7315**)
- **Types:** Add the missing readonly `name: 'CanceledError'` declaration to CommonJS `CanceledError` typings to match the ESM declarations. (**#10922**)
- **Config Merge:** Added `transitional.validateStatusUndefinedResolves` (default `true`) so applications can opt into treating explicit `validateStatus: undefined` like an omitted option by setting it to `false`. `validateStatus: null` still accepts every response status. (**#10899**, closes **#6688**)

## Release Tracking

- ESM/CJS typings are updated for `transitional.validateStatusUndefinedResolves`; README/docs updates are tracked in `PRE_RELEASE_DOCS.md` for release preparation.
