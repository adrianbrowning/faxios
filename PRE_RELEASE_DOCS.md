# Pre-Release Documentation Notes

## Purpose

Track documentation updates that should be applied during release preparation.

Do not treat this file as final documentation. Each entry should give enough context for a maintainer or LLM to update README, docs pages, examples, migration guides, and translated docs when the release is prepared.

Do not store raw diffs or line-number-only instructions here; prefer stable section names, target files, required concepts, examples, and release-specific notes.

## Entry Format

- **Change:** Short feature/fix name.
- **Source:** PR, issue, or changelog reference.
- **Status:** Pending | Applied | Skipped.
- **Docs targets:** Files or docs sections likely needing updates.
- **Required content:** What the docs must explain.
- **Examples:** Any code snippets or examples that should be included.
- **Notes:** Constraints, release-only wording, translation follow-up, etc.

## Unreleased

### config.adapter removal (custom adapter support dropped)

- **Change:** `config.adapter` removed from `FaxiosRequestConfig`. `FaxiosAdapter`, `FaxiosAdapterConfig`, `FaxiosAdapterName` types deleted. `getAdapter` removed from public exports. `fetch` is the only transport, unconditionally.
- **Source:** Issue #12 (collapse request-config pipeline / adapter removal).
- **Status:** Pending.
- **Docs targets:** README request config table (remove `adapter` row); docs-site request-config page; any adapter authoring / custom transport guide; migration guide.
- **Required content:** Document that `config.adapter` is no longer accepted (TypeScript error if passed, ignored at runtime). Remove any documentation that shows passing a string `'fetch'` or a custom function as `config.adapter`. In migration guide, tell consumers who used `config.adapter: 'fetch'` (no-op) to remove it, and consumers who used a custom adapter function that this pattern is no longer supported — they should wrap faxios via interceptors or a separate fetch call instead.
- **Examples:** None.
- **Notes:** This is a breaking API change requiring a migration guide entry. The internal clone-mechanism change (`mergeConfig` → dedicated null-proto clone in `prepareRequest`) is a pure internal change with no observable behavior difference and does **not** need a docs entry.

### Fetch-only migration — README + docs-site swept (issue #5)

- **Change:** faxios now uses the web-standard `fetch` API as its only transport in all runtimes. The Node `http`/`https` adapter, browser XHR adapter, Node platform layer, and the `follow-redirects` / `form-data` / `proxy-from-env` / `https-proxy-agent` deps were removed. `onUploadProgress` dropped; many Node transport config fields removed (see `MIGRATION_GUIDE.md` "Fetch-Only Migration"). Connection failures standardize to `ERR_NETWORK` with the OS error on `error.cause`.
- **Source:** Issue #5 (web standards / fetch-only migration).
- **Status:** Pending (release prep applies final docs).
- **Docs targets:** README (transport/adapter description, Node-specific config sections, proxy/redirect docs, install snippets); docs-site getting-started, adapter, request-config, security, and proxy pages; translated docs after English is finalized.
- **Required content:** Document fetch-as-only-transport; remove docs for removed config fields (`maxRedirects`, `maxRate`, `beforeRedirect`, `socketPath`, `allowedSocketPaths`, `transport`, `httpAgent`, `httpsAgent`, `proxy`, `decompress`, `insecureHTTPParser`, `httpVersion`, `http2Options`, `sensitiveHeaders`, `lookup`, `family`); document `onUploadProgress` removal; document `ERR_NETWORK` + `error.cause`; document proxy via runtime/`fetchOptions` (undici dispatcher).
- **Notes:** README and the docs site were **swept for fetch-only in this work** including all 4 locale translations (en, es, fr, zh); release prep covers final review only. `MIGRATION_GUIDE.md` already carries the user-facing breaking-change section.

### ESM-only package; CJS and CDN/UMD builds dropped (TypeScript migration)

- **Change:** The TypeScript migration ships an ESM-only package built by `zshy`. The CommonJS (`require`) build, `index.d.cts` (`export = faxios`) types, and the browser/UMD/minified CDN bundles (`jsdelivr`/`unpkg`/`browser`/`react-native` entries) were removed.
- **Source:** `feat/add_typescript` branch; review tasks A–C.
- **Status:** Pending.
- **Docs targets:** README install/usage (any `require('faxios')` or `<script src="cdn...">` snippets); docs site getting-started/CDN pages; examples that use CommonJS or CDN script tags; translated docs after English is finalized.
- **Required content:** Document that faxios is now ESM-only (`import faxios from 'faxios'`). `require('faxios')` works only via Node's ESM interop; there is no dedicated CJS entry or `.d.cts`. Remove or rewrite any CDN/UMD `<script>` install instructions.
- **Examples:** None yet.
- **Notes:** CDN/UMD build restoration is deferred to a future release — if/when re-added, re-introduce a bundler step and the corresponding `exports` conditions, then update these docs. Do not document CJS or CDN usage as supported in the meantime.

### malformed HTTP URL rejection

- **Change:** Note that malformed `http:` and `https:` URLs missing `//` are rejected before adapter normalization.
- **Source:** `PRE_RELEASE_CHANGELOG.md` Bug Fixes, #10900, closes #7315.
- **Status:** Skipped.
- **Docs targets:** None beyond release notes.
- **Required content:** No API documentation update is needed because this changes handling for invalid URL input without adding or changing request config, types, or public APIs. The release note should mention that faxios now throws `FaxiosError` with `ERR_INVALID_URL` for malformed HTTP(S) URLs such as `https:example.com` or `http:/example.com` instead of allowing platform URL normalization.
- **Examples:** None.
- **Notes:** Treat as a bug/security-hardening release note, not a request-config documentation change.

### sensitiveHeaders request config — REMOVED

- **Change:** The `sensitiveHeaders` request config option has been **removed entirely** as part of the fetch-only migration. faxios no longer follows redirects itself (the Node `http`/`https` adapter and `follow-redirects` are gone), so there is no faxios-level redirect header-stripping option. Redirect handling and cross-origin credential stripping are now delegated to the underlying `fetch` runtime.
- **Source:** Fetch-only migration (issue #5); supersedes #10892.
- **Status:** Pending.
- **Docs targets:** `docs/pages/misc/security.md`; `docs/pages/advanced/request-config.md`; README request config section; translated docs after English docs are finalized.
- **Required content:** Do **not** document `sensitiveHeaders` as a supported option. Remove any reference to it. Where redirect credential handling is discussed, explain that faxios delegates redirects to the `fetch` runtime (which applies WHATWG Fetch cross-origin rules) and that callers needing manual control should set `redirect: 'manual'` via `fetchOptions` and reissue the request themselves.
- **Examples:** None (the feature no longer exists).
- **Notes:** This is a removal, not a doc tweak. Ensure no security-page row or request-config entry advertises `sensitiveHeaders`.

### validateStatus undefined transitional option

- **Change:** Document `transitional.validateStatusUndefinedResolves` for the `validateStatus: undefined` merge behavior.
- **Source:** `PRE_RELEASE_CHANGELOG.md` Bug Fixes, #10899, closes #6688.
- **Status:** Pending.
- **Docs targets:** README request config section; `docs/pages/advanced/request-config.md` `validateStatus` section and request config example; translated request-config docs after English docs are finalized.
- **Required content:** Explain that `validateStatus: undefined` keeps legacy behavior by default and resolves every response status because `transitional.validateStatusUndefinedResolves` defaults to `true`. Explain that setting `transitional.validateStatusUndefinedResolves` to `false` makes explicit `validateStatus: undefined` behave like the option was omitted, so faxios uses the configured/default validator and rejects non-2xx responses by default. Mention that `validateStatus: null` still accepts every response status, and users who disable the transitional behavior should use `null` or `() => true` when they intentionally want all statuses to resolve.
- **Examples:** Include a short opt-in example.

```js
faxios.get('/user/12345', {
  validateStatus: undefined,
  transitional: {
    validateStatusUndefinedResolves: false
  }
});
```

- **Notes:** This is release-prep documentation only; do not update README or docs pages in the feature/fix PR.

### docs/advanced/headers.md — translation tracking

- **Change:** `docs/advanced/headers.md` was added/updated in the fetch-only sweep (English only). Translated versions have not been created.
- **Source:** Issue #5 fetch-only migration docs sweep.
- **Status:** Pending.
- **Docs targets:** `docs/es/advanced/headers.md`, `docs/fr/advanced/headers.md`, `docs/zh/advanced/headers.md`.
- **Required content:** Translate the English `docs/advanced/headers.md` into the three supported locales, keeping parity with the English content.
- **Examples:** None beyond the English source.
- **Notes:** English-only at time of writing; create translated siblings before release.
