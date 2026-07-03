# Plan: Response Schema Validation (Standard Schema)

> Source: Issue #4 — Standard Schema support (response side)

## Architectural decisions

- **Config field**: `config.responseSchema` — accepts any `StandardSchemaV1` compliant schema
- **Standard Schema types**: Vendored in `lib/types/standard-schema.ts` (ref: https://standardschema.dev)
- **Lifecycle position**: After `transformResponse`, before response interceptors, inline in `dispatchRequest.ts`
- **Error code**: `FaxiosError.ERR_BAD_RESPONSE_SCHEMA` (static constant)
- **Type narrowing**: `isSchemaValidationError()` type guard in `lib/core/FaxiosError.ts`, exported from `index.ts`
- **TypeScript inference**: When `responseSchema` is present, `response.data` type is inferred from schema output (conditional type override)
- **Behavior**: Always `await` validate (supports sync + async schemas). Skip when `validateStatus` rejects. Always run even if data is null/undefined.

---

## Phase 1: Vendored types + config field

**User stories**: As a developer, I can pass `responseSchema` in my request config and see it type-checked.

### What to build

Create `lib/types/standard-schema.ts` with the vendored `StandardSchemaV1` interface. Add `responseSchema` to `FaxiosRequestConfig` in `lib/types.ts`. Ensure `mergeConfig` handles it (should work via existing fallback strategy — verify with a test).

### Acceptance criteria

- [ ] `lib/types/standard-schema.ts` exists with vendored Standard Schema v1 types and doc link
- [ ] `FaxiosRequestConfig` accepts `responseSchema?: StandardSchemaV1<unknown, T>`
- [ ] TypeScript compiles with no errors
- [ ] Unit test: `mergeConfig` merges `responseSchema` (config2 wins, fallback to config1)

---

## Phase 2: Validation logic + error throwing

**User stories**: As a developer, when my response data doesn't match the schema, I get a `FaxiosError` with code `ERR_BAD_RESPONSE_SCHEMA` and the schema's issues array.

### What to build

Add `ERR_BAD_RESPONSE_SCHEMA` static constant to `FaxiosError`. Inline the validation logic in `dispatchRequest.ts` after `transformResponse` applies. On success, replace `response.data` with `result.value`. On failure, throw `FaxiosError` with issues attached. Skip validation when the response was already rejected by `validateStatus`.

### Acceptance criteria

- [ ] `FaxiosError.ERR_BAD_RESPONSE_SCHEMA` exists as static readonly
- [ ] Successful schema validation replaces `response.data` with parsed value
- [ ] Failed schema validation throws `FaxiosError` with correct code and `issues` property
- [ ] Validation does NOT run when `validateStatus` rejects (HTTP error path)
- [ ] Async schemas (returning `Promise<Result>`) work correctly
- [ ] Unit tests cover: valid data, invalid data, async schema, no schema (passthrough), HTTP error skips validation

---

## Phase 3: Type guard + TypeScript inference

**User stories**: As a TypeScript user, `response.data` is automatically typed from my schema's output type without manual generics. I can narrow caught errors with `isSchemaValidationError()`.

### What to build

Add `isSchemaValidationError` type guard to `FaxiosError.ts`. Add conditional type inference so that when `responseSchema: StandardSchemaV1<any, O>` is present in config, `response.data` resolves to `O`. Export `isSchemaValidationError` from `index.ts`.

### Acceptance criteria

- [ ] `isSchemaValidationError(err)` narrows to `FaxiosError & { issues: StandardSchemaV1Issue[] }`
- [ ] `isSchemaValidationError` exported from package entry
- [ ] When `responseSchema` is provided, `response.data` type infers from schema output (no manual `<T>`)
- [ ] When no `responseSchema`, existing `<T>` generic behavior unchanged
- [ ] Type tests verify inference works with Zod-like schema shapes

---

## Phase 4: Integration tests + docs prep

**User stories**: As a maintainer, I'm confident this works end-to-end with real schema libraries and the feature is documented for release.

### What to build

End-to-end tests using a minimal Standard Schema compliant object (no real Zod dependency needed — just an object implementing `~standard`). Test the full request lifecycle including interceptors. Update `PRE_RELEASE_DOCS.md` and `PRE_RELEASE_CHANGELOG.md`.

### Acceptance criteria

- [ ] Integration test: full request → transform → validate → response.data is typed value
- [ ] Integration test: validation failure → catch → `isSchemaValidationError` → access issues
- [ ] Integration test: instance-level `responseSchema` works via `create()`
- [ ] `PRE_RELEASE_CHANGELOG.md` updated
- [ ] `PRE_RELEASE_DOCS.md` updated with docs notes for release
