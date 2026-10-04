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

### `.use()` middleware

- **Change:** Instances take onion-style middleware and plugins through `use()`, removable with `eject()`.
- **Source:** Issue #88 (part of #54); `PRE_RELEASE_CHANGELOG.md` Features entry "`.use()` middleware".
- **Status:** Pending.
- **Docs targets:** A new `pages/advanced/middleware.md` (concept, ordering, plugins), `pages/advanced/create-an-instance.md`, the TypeScript section of `pages/advanced/api-reference.md`, and the package README feature list. The interceptor pages are rewritten later, when interceptors are removed (#89).
- **Required content:** Ordering: registration order on the way in, reverse on the way out (`a before → b before → request → b after → a after`). `ctx.config` is the merged request config and `ctx.config.headers` is a `FaxiosHeaders`, so `.set()` works before `next`. Each `next()` sends a copy of the config, so changes dispatch makes (path-param substitution, `transformRequest`, schema output) never show up on `ctx.config`, and calling `next` again retries from the same input. Non-2xx responses reach middleware as a rejected `FaxiosError` (because of `validateStatus`), not as a response. Returning without `next` skips the request, including schema validation. `ctx.state` is per request; `ctx.capabilities` holds plugin `provides` values for every request, and duplicate keys throw `ERR_BAD_OPTION`. `use()` returns the instance; `eject()` removes by reference and leaves running requests alone. `create()` children start with no middleware. Aborting at any point before the request is sent rejects with `CanceledError` and sends nothing, even when a middleware awaits before `next`.
- **Examples:** An auth-header middleware; a retry loop that calls `next` again on `ERR_NETWORK`; a cache that returns a stored response without calling `next`; a plugin with `provides`.
- **Notes:** Typed plugin request options and capability requirements (#90) and the built-in plugins (#91) extend this page later.

### Typed `.use()` plugins

- **Change:** `use()` returns the instance typed with the plugin's request options and capabilities; plugins can require capabilities other plugins provide.
- **Source:** Issue #90 (part of #54); `PRE_RELEASE_CHANGELOG.md` Features entry "Typed `.use()` plugins".
- **Status:** Pending.
- **Docs targets:** The middleware page from the `.use()` middleware entry (sections "Writing a plugin" and "Adding typed request options"), the TypeScript section of `pages/advanced/api-reference.md`, and `pages/advanced/type-script.md`.
- **Required content:** `FaxiosPlugin<TRequires, TProvides, TOptions>` and what each parameter does. Chain `use()` and keep the returned instance: the same object at runtime, but only the returned type knows the plugin's options. Options appear on every config-taking member, including `defaults`, `define()` and `route()`. A plugin installed before what it requires is a type error naming the missing capability, as is a provider with an incompatible shape. `create()` children start untyped; `eject()` doesn't narrow the type. Declaring a capability in `TProvides` makes `provides` required. Known limit: excess-property checks only run on object literals, so a config held in a variable can carry a plugin option without the plugin installed.
- **Examples:** A `cache()` plugin with `CacheOptions`; `authBearer(getToken)` providing `auth`; `refreshOn401()` requiring `auth`, shown failing before `authBearer` and passing after it; the compiler message for the missing capability.
- **Notes:** The built-in plugins (#91) are the natural examples once they exist.

### Built-in plugin: `authBearer`

- **Change:** `authBearer(getToken)` sets `Authorization: Bearer <token>` on every request and provides the `auth` capability.
- **Source:** Issue #91 (part of #54); `PRE_RELEASE_CHANGELOG.md` Features entry "Built-in plugins".
- **Status:** Pending.
- **Docs targets:** A plugins section of the middleware page; rewrite `pages/advanced/authentication.md` ("Bearer tokens (JWT)") around it.
- **Required content:** `getToken` may return a string or a promise and is called on every request. It overwrites any `Authorization` header already on the request. Later plugins call `ctx.capabilities.auth.getToken()`.
- **Examples:** `faxios.create({ baseURL }).use(authBearer(() => store.token))`.
- **Notes:** None.

### `refreshOn401` example

- **Change:** The documented way to refresh a token on 401, built on `authBearer`'s `auth` capability.
- **Source:** Issue #91; the plugin is written out in `packages/tests/unit/plugins/authBearer.test.ts`.
- **Status:** Pending.
- **Docs targets:** `pages/advanced/authentication.md` ("Token refresh"), replacing the `check=skip` interceptor block; the "Writing a plugin" section of the middleware page.
- **Required content:** A `FaxiosPlugin<AuthBearerCapability>` that catches a `FaxiosError` with `err.response?.status === 401` (a 401 arrives as a rejection because `validateStatus` rejects non-2xx, not as a response), refreshes, sets the header from `ctx.capabilities.auth.getToken()` and calls `next(ctx)` once more. Installing it before `authBearer` is a type error.
- **Examples:** The test's `refreshOn401(refresh)` verbatim, installed as `.use(authBearer(getToken)).use(refreshOn401(refresh))`.
- **Notes:** Calls `next` twice, which is safe because each `next()` dispatches its own config copy.

### Built-in plugin: `retry`

- **Change:** `retry({ attempts, retryOn, delay })` retries failed requests by calling `next` again, with a per-request `retry` option.
- **Source:** Issue #91; `PRE_RELEASE_CHANGELOG.md` Features entry "Built-in plugins".
- **Status:** Pending.
- **Docs targets:** Rewrite `pages/advanced/retry.md` around it, replacing its three `check=skip` interceptor blocks; plugins section of the middleware page.
- **Required content:** `attempts` counts every try including the first (default 3). By default it retries `ERR_NETWORK`, `ETIMEDOUT` and 5xx responses, never a cancellation. `delay` is milliseconds or `(attempt, error) => ms`, default 100ms doubling. Per request, `retry: false` turns it off and `retry: { … }` overrides fields. An abort during the backoff rejects with `CanceledError` straight away. A stream body (web `ReadableStream` or a Node stream) is never retried, since the first try consumed it. It resends non-idempotent methods too; use `retryOn` to limit that.
- **Examples:** `retry({ attempts: 5 })`; `retryOn` for 429; `api.post(url, data, { retry: false })`.
- **Notes:** Install `timing` before `retry` to measure all tries together, after it to measure each try.

### Built-in plugin: `timing`

- **Change:** `timing(onTiming)` reports each request's duration with its status or error.
- **Source:** Issue #91; `PRE_RELEASE_CHANGELOG.md` Features entry "Built-in plugins".
- **Status:** Pending.
- **Docs targets:** Plugins section of the middleware page.
- **Required content:** `onTiming({ config, durationMs, status })` on success, `onTiming({ config, durationMs, error })` on failure (the error is rethrown; if `onTiming` itself throws there, the request still rejects with its own error, while a throw on success rejects the request). Uses `performance.now()` where available. The response is unchanged. Order relative to `retry` decides whether retries are measured together or separately.
- **Examples:** Sending durations to a metrics client.
- **Notes:** None.

### Interceptors removed

- **Change:** `interceptors.request`/`interceptors.response`, their types and `transitional.legacyInterceptorReqResOrdering` are gone; `.use()` middleware replaces them.
- **Source:** Issue #89 (part of #54); `PRE_RELEASE_CHANGELOG.md` Breaking Changes entry "Interceptors are removed".
- **Status:** Pending.
- **Docs targets:** These English blocks were marked `check=skip` so `test:docs-examples` keeps passing; rewrite each to `.use()` and remove the marker:
  - `pages/advanced/interceptors.md`: every block (Interceptors, Removing Interceptors, Interceptors default behaviour, Interceptors using `runWhen`, Interceptor execution order). Replace the page with the middleware page, or turn it into "Migrating from interceptors", and update the sidebar in `packages/docs/.vitepress/config.mts`.
  - `pages/advanced/retry.md`: "Basic retry with a response interceptor", "Exponential backoff", "Retrying on 429 (rate limit) with Retry-After".
  - `pages/advanced/authentication.md`: "Bearer tokens (JWT)", "Token refresh".
  - `pages/advanced/headers.md`: "Working with headers", "Setting headers in an interceptor", "Unicode header values".
  - `pages/advanced/create-an-instance.md`: "Isolated interceptors".
  - `pages/advanced/request-config.md`: "Full request config example" (drop `legacyInterceptorReqResOrdering`), and the `transitional` option list above it.
  - `pages/advanced/testing.md`: "Testing interceptors" (was `check=types`).
  - `pages/advanced/type-script.md`: "Typed instances and interceptors".
  - `pages/getting-started/examples/typescript.md`: "Typed interceptors".
  - Prose that still mentions interceptors: `pages/advanced/define.md`, `pages/advanced/schema-validation.md`, `pages/getting-started/upgrade-guide.md`, the package README, `MIGRATION_GUIDE.md`, `ECOSYSTEM.md`, `packages/examples/improved-network-errors.md` and `packages/examples/network_enhanced.js`, plus the es/fr/zh copies.
- **Required content:** Interceptors don't exist; `.use()` is the lifecycle API. Migration: a request interceptor becomes code before `await next(ctx)` that changes `ctx.config`; a response interceptor becomes code after it; an `onRejected` handler becomes a `try`/`catch` around `next`. Request interceptors ran last-registered-first, middleware runs in registration order on the way in, so reverse the registration order of migrated request interceptors. `runWhen` becomes an `if` that calls `next` straight away; `synchronous` has no equivalent. `eject(id)` becomes `eject(middleware)` with the same function reference. Passing `transitional.legacyInterceptorReqResOrdering` now throws `ERR_BAD_OPTION` ("Unknown option").
- **Examples:** Before/after for an auth-header request interceptor, a response interceptor that unwraps `data`, and a retry-on-401 response interceptor rewritten as `try { return await next(ctx) } catch (err) { … return next(ctx) }`.
- **Notes:** Remove every `check=skip` marker added for this change once its block is rewritten.

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
