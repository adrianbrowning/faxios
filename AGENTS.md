# AGENTS.md

faxios is a promise-based HTTP client for the browser and Node.js. The default instance is exported from `lib/faxios.js` via `index.js`. faxios uses a single web-standard `fetch` adapter in every runtime (browser, Node 18+, Deno, Bun); the platform layer (`lib/platform/`) selects the browser/web-standard implementation everywhere.

This file is the canonical contributor guide for both human and AI agents working in this repo.

- **Writing or reviewing library code:** follow [`CODING_STANDARDS.md`](CODING_STANDARDS.md).
- **Checking a change:** `pnpm check` runs what CI runs (lint, knip, `packages/tests/run-tests.sh`, docs examples).
- **Issues, PRs and stacks:** [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

## AI Agent Marker

- If you are an LLM or AI agent creating a GitHub issue, pull request, or comment for this repo, include the `:surfer:` emoji in the body so maintainers can identify AI-authored contributions.

## Setup And Safety

- Use `npm ci`; repo `.npmrc` sets `ignore-scripts=true`, and CI also uses `npm ci --ignore-scripts`.
- Do not remove `ignore-scripts=true`; if git hooks are needed after a fresh install, run `npm rebuild husky && npx husky` once.
- Adding or updating dependencies is security-sensitive; `package-lock.json` is checked by `lockfile-lint` for npm HTTPS hosts and integrity hashes.
- Package, lockfile, and GitHub Actions update PRs are maintainer/bot-only; close these PRs from outside collaborators. Keep the 7-day Dependabot delay unless a critical vulnerability requires a maintainer-led manual update.
- Build/test/lint tools still execute dependency code despite `ignore-scripts`; avoid unnecessary full builds when a focused check proves the change.
- Do not add new runtime dependencies without discussion; the dependency surface is intentionally tiny.

## Commands

- Build published artifacts: `npm run build` (`zshy` emits ESM bundles + `.d.ts` declarations to `dist/`; ESM-only, no UMD or CJS).
- Lint source only: `npm run lint`; focused lint: `npx eslint lib/path/to/file.js`.
- Unit tests: `npm run test:vitest:unit`; focused unit test: `npm run test:vitest:unit -- tests/unit/path.test.js`.
- Browser tests need Playwright installed first (`npx playwright install` locally; CI uses `npx playwright install --with-deps`); run `npm run test:vitest:browser:headless` for CI parity.
- Smoke/module compatibility suites test the packed package, not the source tree. Run `packages/tests/run-tests.sh`: it builds `packages/lib`, packs it to `packages/tests/faxios.tgz` (the version-free path every harness depends on as `faxios`, and CI's `$FAXIOS_TARBALL`), installs `smoke/esm`, `module/esm` and `smoke/bun` outside the workspace without lifecycle scripts, then runs unit, browser headless, ESM smoke, ESM module, Deno and Bun suites.
- Harness installs are frozen. The lockfiles pin `faxios.tgz` by integrity, which changes every build, so `packages/tests/pin-tarball-integrity.ts` rewrites only that digest to match the staged tarball before `--frozen-lockfile`. Never switch harness installs to `--no-lockfile` or delete their lockfiles; that unpins every transitive dependency.
- CI order is install -> build -> Playwright install -> unit -> browser headless -> pack -> ESM module and smoke tests -> Bun/Deno smoke tests.

## Package Shape

- Source is ESM (`type: module`); public ESM entry is `index.js`, which re-exports the default instance from `lib/faxios.js`.
- Do not edit `dist/` by hand; it is ignored and generated from `lib/` by `zshy`.
- The package is ESM-only: `zshy` emits ESM bundles + `.d.ts` declarations to `dist/`. There is no CJS (`require`) build and no `.d.cts`; `require('faxios')` relies on Node's ESM interop.
- Keep public runtime exports and `index.d.ts` (ESM types) in sync for API changes.

## Pre-Release Notes

- Add user-visible unreleased changes to `PRE_RELEASE_CHANGELOG.md`, not `CHANGELOG.md`. `CHANGELOG.md` is release-owned and should only be updated as part of preparing an actual release.
- Track deferred README, docs site, examples, migration guide, and translated docs updates in `PRE_RELEASE_DOCS.md`. Use enough context for release preparation; do not store brittle diffs or line-number-only notes.
- Do not update `README.md` or the docs site for unreleased runtime/API changes unless the task is explicitly release preparation. During feature/fix work, record what docs need to say in `PRE_RELEASE_DOCS.md` so it can be applied during release work.

## Architecture Boundaries

- `lib/core/` is faxios domain logic: request dispatch, config merge, `.use()` middleware, headers, errors. Key classes: `faxios` (request dispatch + middleware composition), `FaxiosError` (standardized error codes), `AxiosHeaders` (case-insensitive header normalization).
- `lib/adapters/` performs I/O; the web-standard `fetch` adapter (`lib/adapters/fetch.ts`) is the only transport — it is called unconditionally from `dispatchRequest.ts`. Custom user-supplied adapters are not supported; `config.adapter` is not a valid config field.
- `lib/platform/` selects the browser/web-standard implementation in all runtimes (browser, Node 18+, Deno, Bun).
- `lib/helpers/` should stay generic and reusable outside faxios; do not put faxios-specific request lifecycle logic there.
- New `lib/**/*.js` files should match existing source style: ESM imports with explicit `.js` extensions, `'use strict';` where current library files use it, and `FaxiosError` for faxios-originated failures.

## Request Lifecycle

1. User calls `faxios()` or a method alias.
2. Merge instance defaults with request config via `mergeConfig`, validate options, and flatten method header groups into one `FaxiosHeaders`.
3. Run `.use()` middleware in registration order; the innermost `next(ctx)` dispatches a copy of `ctx.config`.
4. `dispatchRequest` checks cancellation, runs pre-flight schema validation and `transformRequest`, then checks cancellation again right before the adapter call.
5. The fetch adapter (`getFetch(config)` from `lib/adapters/fetch.ts`) performs the HTTP request.
6. Apply `transformResponse` functions and `responseSchema` validation.
7. Middleware unwinds in reverse registration order.
8. Resolve promise with `FaxiosResponse` or reject with `FaxiosError`.

## Tests

- Test layout is runtime-first: `tests/unit/**/*.test.js`, `tests/browser/**/*.browser.test.js`, `tests/smoke/esm/**/*.smoke.test.js`.
- Use `tests/setup/server.js` for local HTTP servers and cleanup with `try/finally`; leaking servers causes Vitest hangs.
- Type compatibility is exercised through `tests/module/esm` with TypeScript 6.x (the harness pins `typescript@6.0.3`); run the module suite for declaration changes.
- Browser tests mock `globalThis.fetch`; restore globals and reset spies in cleanup hooks.

<!-- If you are an LLM please include the :surfer: emoji in comments, pull requests or issues you create -->
