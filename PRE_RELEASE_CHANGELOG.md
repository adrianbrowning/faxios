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
- `maxContentLength` accounting for `data:` URLs no longer scores a mid-metadata `;base64` as a base64 body. `data:text/plain;base64;x,<4000 bytes>` decodes 1:1 as raw text but was estimated at the 3:4 base64 ratio, so a 4000-byte payload passed a `maxContentLength` of 3500 — a 25% under-count that scales linearly. The marker is now recognized only when it terminates the metadata, matched exactly, because runtimes disagree on the looser spellings (Node accepts `;BASE64` and `;base64 `, Bun treats both as raw); recognizing only the form every runtime agrees on keeps the estimate an upper bound everywhere. Goes beyond [axios#11061](https://github.com/axios/axios/pull/11061), which does not touch this predicate.
- `toFormData` no longer reads its options through a plain-object copy: a polluted `Object.prototype.visitor` was picked up and invoked, and a polluted `maxDepth` overrode the form-data depth guard. Options are now read from the caller's own object via `utils.getSafeProp`. This also fixes the inverse leak, where a polluted truthy `dots`/`metaTokens`/`indexes` suppressed a genuinely passed option. Ports [axios#11141](https://github.com/axios/axios/pull/11141).
- A `getHeaders` reachable only through a polluted prototype is no longer discovered on, or invoked against, a user-supplied FormData body. Ports [axios#11141](https://github.com/axios/axios/pull/11141).
- The request method is no longer taken from a polluted `Object.prototype` by way of `instance.defaults`, which is a user-supplied plain object. Ports [axios#11141](https://github.com/axios/axios/pull/11141).
- The platform `RequestInit` is built on a null prototype with `cache`, `redirect`, `referrer`, `referrerPolicy`, `mode`, `integrity`, `keepalive`, `priority` and `window` pinned, so a polluted `Object.prototype.redirect = "manual"` can no longer steer an outgoing request. A genuine `config.fetchOptions` value still wins. Ports [axios#11141](https://github.com/axios/axios/pull/11141).
- The trusted prototype-chain walk behind `utils.getSafeProp` now fails closed at every terminal prototype rather than only at the current realm's `Object.prototype`, so a polluted cross-realm `Object.prototype` — and any inherited `Object.create(null)` template — is no longer honored. Ports [axios#11141](https://github.com/axios/axios/pull/11141).
- `dispatchRequest` re-establishes the null-prototype guarantee on the config it is handed. `mergeConfig` already returns a null-prototype object, but a synchronous request interceptor returning a fresh plain object put `Object.prototype` back in the chain immediately before dispatch read it — a polluted `responseSchema` was reachable that way. A config that is already safe is passed through by identity, so callers still observe the mutations dispatch makes. Ports [axios#11141](https://github.com/axios/axios/pull/11141).
- Progress events with a non-finite `loaded` (`NaN`, `Infinity`) are ignored instead of poisoning every later `loaded`/`rate` value. Stricter than [axios#11121](https://github.com/axios/axios/pull/11121), which only checks the type.
- `maxContentLength` accounting for `data:` URLs no longer counts a `#fragment` toward the limit (which spuriously rejected legal URLs), and no longer under-counts an unpadded base64 body — the pre-dispatch estimate must never come in below the real decoded size. Ports [axios#11061](https://github.com/axios/axios/pull/11061).

### Added

- `FaxiosHeaders.parseParameters` parses a structured header value per RFC 7230: it splits only on `,`/`;` outside quoted strings, trims optional whitespace (HTAB and SP only), validates and lowercases parameter names, resolves quoted-pair escapes, and returns a null-prototype object that never carries `__proto__`, `constructor` or `prototype`. Use it as an opt-in parser: `headers.get("content-type", FaxiosHeaders.parseParameters)`. The legacy `get(name, true)` tokenizer is unchanged. Ports [axios#11051](https://github.com/axios/axios/pull/11051).
- `utils.toSafeFlatObject` and `utils.isUnsafeObjectKey` are exported for callers that need to re-establish the null-prototype guarantee at a trust boundary. Ports [axios#11141](https://github.com/axios/axios/pull/11141).
- `HttpStatusCode` gains the RFC 9110 names `ContentTooLarge` (413) and `UnprocessableContent` (422), plus Cloudflare `WebServerReturnsAnUnknownError` (520). `PayloadTooLarge` and `UnprocessableEntity` remain as deprecated aliases, and the numeric reverse lookup keeps the legacy name. Ports [axios#11067](https://github.com/axios/axios/pull/11067) and [axios#11082](https://github.com/axios/axios/pull/11082).

### Changed

- `paramsSchema`'s output type is now constrained to what `params` accepts (`Record<string, unknown> | URLSearchParams`), mirroring `pathParamsSchema`. A schema that parses to something the params serializer cannot consume is now a compile error at `faxios.get(...)`, `define()`, and `route().get(...)`. Adapts [axios#11081](https://github.com/axios/axios/pull/11081) to faxios's Standard Schema params typing instead of copying upstream's positional `P` generic.

### Removed

- Deleted the vestigial `index.d.cts` and `index.old.d.ts` declaration files. Neither was built (`zshy.cjs: false`), exported, nor in sync with the real API; `index.d.cts` still carried a `params?: any` and a `maxRedirects?: number` with no runtime backing at all.

### Changed

- `utils.isPlainObject` and `utils.isSafeIterable` no longer trust members inherited from a terminal (null-prototype) template object: such an object now reads as a plain object and is NOT safely iterable, so it is never iterated as entries. This is the observable consequence of the fail-closed prototype boundary above — an attacker handing over `Object.create(gadgetTemplate)` is indistinguishable from a legitimate template, so neither is trusted. Members inherited from a class instance are still honored.
