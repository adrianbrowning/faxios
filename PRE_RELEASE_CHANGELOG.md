# Pre-Release Changelog

## Unreleased

### Fixed

- A throwing **synchronous** request interceptor now vetoes the request instead of being swallowed: the returned promise rejects and no request is dispatched. If the interceptor has a rejection handler, its result decides what happens — returning a config dispatches with that config, throwing rejects. Ports [axios#11071](https://github.com/axios/axios/pull/11071).
- `headers.options` is no longer leaked into outgoing requests as a header literally named `options`. Per-method header buckets are now seeded and stripped from one frozen method list (`lib/core/methodList.ts`). Ports [axios#11096](https://github.com/axios/axios/pull/11096).
- `timeoutErrorMessage` is merged with the documented `defaultToConfig2` strategy; the strategy table previously keyed the non-existent `timeoutMessage`. Ports [axios#11096](https://github.com/axios/axios/pull/11096).
- A userland `Error.prepareStackTrace` returning a non-string no longer replaces a request error with a `TypeError`, and a non-string `error.stack` is left untouched rather than silently coerced to a string. Ports [axios#11109](https://github.com/axios/axios/pull/11109).
- `FaxiosError#cause` is now non-enumerable — matching native `new Error(msg, { cause })` — so a nested or cyclic cause chain no longer breaks `JSON.stringify` of the error. Applies to both `FaxiosError.from` and canceled requests. Ports [axios#10913](https://github.com/axios/axios/pull/10913).
- Wrapping an `AggregateError` no longer produces a blank message: the aggregated errors' messages are joined with `"; "`, falling back to the error name. Ports [axios#11059](https://github.com/axios/axios/pull/11059).
- `FaxiosError#toJSON()` serializes a `Set` in the config as an array instead of `{}`. Ports [axios#11044](https://github.com/axios/axios/pull/11044).
- `mergeConfig` preserves symbol-keyed config entries, which `Object.keys` previously dropped. Ports [axios#11043](https://github.com/axios/axios/pull/11043).
- Progress events with a non-finite `loaded` (`NaN`, `Infinity`) are ignored instead of poisoning every later `loaded`/`rate` value. Stricter than [axios#11121](https://github.com/axios/axios/pull/11121), which only checks the type.
- `maxContentLength` accounting for `data:` URLs no longer counts a `#fragment` toward the limit (which spuriously rejected legal URLs), and no longer under-counts an unpadded base64 body — the pre-dispatch estimate must never come in below the real decoded size. Ports [axios#11061](https://github.com/axios/axios/pull/11061).

### Added

- `HttpStatusCode` gains the RFC 9110 names `ContentTooLarge` (413) and `UnprocessableContent` (422), plus Cloudflare `WebServerReturnsAnUnknownError` (520). `PayloadTooLarge` and `UnprocessableEntity` remain as deprecated aliases, and the numeric reverse lookup keeps the legacy name. Ports [axios#11067](https://github.com/axios/axios/pull/11067) and [axios#11082](https://github.com/axios/axios/pull/11082).
