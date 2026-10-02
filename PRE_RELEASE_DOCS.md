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
- **Notes:** English-only at time of writing; create translated siblings before next release.

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
