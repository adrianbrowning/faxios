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

### docs/advanced/type-script.md — drop the CJS dual-publish claim

- **Change:** `packages/lib/src/index.d.cts` and `index.old.d.ts` were deleted as vestigial — neither was built (`zshy.cjs: false`), exported, nor kept in sync with the real API (`index.d.cts` had no `paramsSchema`/`pathParams`). Types are generated into `dist/index.d.ts` by `zshy`; the package is ESM-only.
- **Source:** Issue #48 (parent #27).
- **Status:** Pending.
- **Docs targets:** `packages/docs/pages/advanced/type-script.md` plus `es/`, `fr/`, `zh/` siblings.
- **Required content:** The opening line must stop claiming `index.d.cts` (CJS) ships alongside `index.d.ts`. The whole "Module resolution caveats" section is predicated on dual-publish CJS and is false: there is no CJS build, no `module.exports`, and the `esModuleInterop` / CJS `moduleResolution` advice does not apply. Replace with ESM-only guidance.
- **Examples:** None.
- **Notes:** All four locales say the same thing; fix English first, then translate. `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, and `COLLABORATOR_GUIDE.md` references were already corrected in the same change since they instruct contributors to edit a now-deleted file.

### docs/advanced/headers.md — document `FaxiosHeaders.parseParameters`

- **Change:** New opt-in RFC 7230 header-parameter parser, exposed as the static `FaxiosHeaders.parseParameters` and usable as a `get` parser. New exported type `FaxiosHeaderParameters`.
- **Source:** Issue #27 checklist item, ports [axios#11051](https://github.com/axios/axios/pull/11051).
- **Status:** Pending.
- **Docs targets:** `packages/docs/pages/advanced/headers.md` plus `es/`, `fr/`, `zh/` siblings.
- **Required content:** Contrast the two parsers. `get(name, true)` is the legacy tokenizer: it keeps surrounding quotes, retains trailing whitespace, emits the bare media type with an `undefined` value, and mis-splits on `,`/`;` inside quoted strings. `headers.get(name, FaxiosHeaders.parseParameters)` is quote- and escape-aware, trims only HTAB/SP, lowercases names, drops bare tokens and non-token names, resolves quoted-pair escapes, and returns a null-prototype object. Document that malformed quoting yields the raw value rather than a guessed one, that later duplicate names win, and that `__proto__`/`constructor`/`prototype` are never materialized. State that the legacy parser is unchanged and not deprecated.
- **Examples:** `headers.get("content-type", FaxiosHeaders.parseParameters)` returning `{ charset: "utf-8", boundary: "--x" }` from `multipart/form-data; charset=utf-8; boundary="--x"`; a `boundary="a,b;c"` case showing the legacy parser's mis-split.
- **Notes:** English first, then the three locales.

### docs — `params` typing and prototype-hardening behaviour changes

- **Change:** (a) `paramsSchema`'s output type is constrained to `FaxiosParams`; (b) `utils.isPlainObject`/`isSafeIterable` no longer trust members inherited from a terminal null-prototype template.
- **Source:** Issues #48 and #27, ports [axios#11081](https://github.com/axios/axios/pull/11081) (adapted) and [axios#11141](https://github.com/axios/axios/pull/11141).
- **Status:** Pending.
- **Docs targets:** `packages/docs/pages/advanced/type-script.md`, any Standard Schema / params page, and `THREATMODEL.md`.
- **Required content:** For (a), document `FaxiosParams` and `ParamsSchema` and that a `paramsSchema` parsing to a non-params shape is now a compile error. For (b), record the fail-closed prototype boundary in `THREATMODEL.md`: the trusted chain walk stops at every terminal prototype, which covers cross-realm `Object.prototype` pollution, and note the deliberate trade-off that a legitimate null-prototype template's members are no longer honored.
- **Examples:** None required.
- **Notes:** (b) is a behavioural change worth calling out in release notes, not only docs.
