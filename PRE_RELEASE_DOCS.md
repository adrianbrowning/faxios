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
