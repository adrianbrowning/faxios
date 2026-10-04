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

### docs/advanced/headers.md — translation tracking

- **Change:** `docs/advanced/headers.md` was added/updated in the fetch-only sweep (English only). Translated versions have not been created.
- **Source:** Issue #5 fetch-only migration docs sweep.
- **Status:** Pending.
- **Docs targets:** `docs/es/advanced/headers.md`, `docs/fr/advanced/headers.md`, `docs/zh/advanced/headers.md`.
- **Required content:** Translate the English `docs/advanced/headers.md` into the three supported locales.
- **Examples:** None beyond the English source.
- **Notes:** English-only at time of writing. Since #26 the es/fr/zh pages are excluded from the site build (see the next entry), so translate this together with the rest of each locale.

### Translated docs hidden from the site

- **Change:** The docs site (GitHub Pages, https://adrianbrowning.github.io/faxios/) ships English only. `packages/docs/.vitepress/config.mts` excludes `es/**`, `fr/**` and `zh/**` through `srcExclude`, and the per-locale nav/sidebar config was removed.
- **Source:** Issue #26.
- **Status:** Pending.
- **Docs targets:** `packages/docs/es|fr|zh/**`, `packages/docs/.vitepress/config.mts` (`locales`, `srcExclude`).
- **Required content:** Bring each locale in line with the English pages, including the pages added in #26 (`define`, `route`, `schema-validation`), the removal of the Adapters page, and the `env.fetch` testing guidance. Then drop the locale from `srcExclude` and add a `locales` entry with its own nav and sidebar.
- **Examples:** None beyond the English source.
- **Notes:** The translated home pages still embed axios's sponsor carousel (`data/sponsors.json` is axios's OpenCollective data). Remove it when re-enabling a locale. `pages/misc/sponsors.md` is excluded for the same reason.

### English docs claims flagged during the #26 README migration

- **Change:** The README-to-site migration checked moved README text against source and found claims in existing English pages that don't match the code.
- **Source:** Issue #26; fixed in #25 and #77.
- **Status:** Applied.
- **Docs targets:** `pages/advanced/progress-capturing.md`, `fetch-adapter.md`, `request-config.md`, `file-posting.md`, `type-script.md`, `header-methods.md`, `multipart-form-data-format.md`, `pages/getting-started/features.md`, `pages/getting-started/first-steps.md`.
- **Required content:** `onUploadProgress` fires where the runtime's `fetch` supports streaming request bodies. `isCancel()` and `isFaxiosError()` are type predicates since #76, so the pages narrow with them rather than `instanceof`. `maxDepth` is now typed on both serializers. Node.js 24+ per `engines`. Normalize runs after the transform passes. The header shortcut list matches `FaxiosHeaders`. `transformResponse` receives `(data, headers, status)`. Timeouts always reject with `ETIMEDOUT`; faxios never raises `ECONNABORTED`, and `transitional.clarifyTimeoutError` has no effect.
- **Examples:** None.
- **Notes:** Translated pages still carry the old claims; fix them when re-enabling each locale. The es/fr/zh `first-steps.md` timeout tip and `error-handling.md` timeout section still describe `ECONNABORTED` and `clarifyTimeoutError` the axios way.

### `env.FormData` accepts the runtime's `FormData`

- **Change:** `env.FormData` is typed `(new () => object) | null`, so the global DOM or Node/undici `FormData` and plain subclasses type-check.
- **Source:** Issue #73; `PRE_RELEASE_CHANGELOG.md` Fixes entry "`env.FormData` accepts the runtime's `FormData`".
- **Status:** Applied (English).
- **Docs targets:** `pages/advanced/multipart-form-data-format.md` ("Automatic serialization to FormData"), and its es/fr/zh siblings.
- **Required content:** The override is constructed with no arguments. `null` falls back to the global `FormData`.
- **Examples:** The English page now uses `class CustomFormData extends FormData {}`. It no longer needs an explicit no-argument `constructor() { super(); }` to type-check.
- **Notes:** The es/fr/zh pages describe the `env.FormData` override, but their example under it never sets `env`. Copy the English example in when you re-enable each locale.

### Strict request header typing

- **Change:** Request-config `headers` is typed as `FaxiosConfigHeaders`, with suggestions for common header names and `Content-Type` values.
- **Source:** Issue #17; `PRE_RELEASE_CHANGELOG.md` Breaking Changes entry "Request `headers` are strictly typed".
- **Status:** Pending.
- **Docs targets:** `docs/advanced/headers.md` (and its es/fr/zh siblings once they exist), the package README's request config and headers sections, and the TypeScript section of the API reference.
- **Required content:** The three accepted shapes (a header bag, method header groups under `common` or a method name, a `FaxiosHeaders` instance), and that a bag and groups can be mixed in one object. The value types and what each one does: `undefined` drops an inherited value but faxios may still set its own (e.g. `Content-Type` for JSON bodies); `null` or `false` keeps the header off the request entirely. Objects and functions are rejected. Newly exported types: `FaxiosConfigHeaders`, `RawFaxiosRequestHeaders`, `HeadersDefaults`.
- **Examples:** `faxios.get(url, { headers: { Accept: "application/json", "X-Request-Id": String(id) } })`; `faxios.create({ headers: { common: { Authorization: "Bearer " + token }, post: { "Content-Type": "application/json" } } })`; removing an inherited header with `{ headers: { Authorization: null } }`.
- **Notes:** Migration guide should mention converting non-header values with `String(...)`.

### Schema validation errors and the unvalidated body

- **Change:** `isSchemaValidationError` narrows on `code`, so `ERR_BAD_RESPONSE_SCHEMA` errors expose a required `response` whose `data` is the body the schema rejected. Nothing documents where that body lives today.
- **Source:** Issue #53; `PRE_RELEASE_CHANGELOG.md` Features entry "`isSchemaValidationError` narrows by error code".
- **Status:** Pending.
- **Docs targets:** A new schema-validation page under `docs/advanced/` (and es/fr/zh siblings), the error-code table in `docs/advanced/error-handling.md` (and siblings), the `responseSchema`/`requestSchema` sections of the package README, and the `FaxiosError` section of `docs/advanced/api-reference.md`, which still uses axios names (`InternalAxiosRequestConfig`, `AxiosResponse<T, D>`, `isAxiosError`).
- **Required content:** The four schema error codes (`ERR_BAD_RESPONSE_SCHEMA`, `ERR_BAD_REQUEST_SCHEMA`, `ERR_BAD_PARAMS_SCHEMA`, `ERR_BAD_PATH_PARAMS_SCHEMA`) and which config field raises each. `error.issues` carries only `message` and `path` from the schema result. On `ERR_BAD_RESPONSE_SCHEMA`, `error.response.data` is the body after `transformResponse` and before validation, typed `unknown`; `response.data` is replaced only when validation passes. On the input codes, `error.config` still holds the caller's original `data`/`params`/`pathParams`, because faxios replaces them only after validation passes. `FaxiosError.toJSON()` never serializes `response`, so the unvalidated body does not appear in serialized errors. The exported `SchemaValidationError` type.
- **Examples:** `try { await api.get(url, { responseSchema: User }) } catch (err) { if (isSchemaValidationError(err) && err.code === FaxiosError.ERR_BAD_RESPONSE_SCHEMA) { log(err.issues, err.response.data) } }`.
- **Notes:** Describe the success path too: after validation passes, `response.data` is the schema output and the pre-validation body is not kept.
