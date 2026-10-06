# AGENTS.md

faxios is a promise-based HTTP client. One web-standard `fetch` adapter serves every runtime (browser, Node 24+, Deno, Bun). It's a pnpm workspace; the published library is `packages/lib` (`@gcmdev/faxios`), and every test harness lives in `packages/tests`.

This file is the canonical contributor guide for both human and AI agents working in this repo.

- **Writing or reviewing library code:** follow [`CODING_STANDARDS.md`](CODING_STANDARDS.md).
- **Checking a change:** `pnpm check` runs what CI runs (lint, knip, `packages/tests/run-tests.sh`, docs examples). Other scripts are in the root and package `package.json` files.
- **Issues, PRs, stacks and CI status:** [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

## AI Agent Marker

- If you are an LLM or AI agent creating a GitHub issue, pull request, or comment for this repo, include the `:surfer:` emoji in the body so maintainers can identify AI-authored contributions.

## Setup And Safety

- Install with `pnpm install --frozen-lockfile`. The repo `.npmrc` sets `ignore-scripts=true`, and CI installs with `--ignore-scripts` too. Keep that setting; if the git hooks are missing after a fresh clone, run `pnpm exec husky` once.
- Adding or updating dependencies is security-sensitive. Don't add runtime dependencies without discussion; the dependency surface is intentionally tiny.
- Package, lockfile, and GitHub Actions update PRs are maintainer/bot-only; close these PRs from outside collaborators. Keep the 7-day Dependabot delay unless a critical vulnerability requires a maintainer-led manual update.
- Build/test/lint tools still execute dependency code despite `ignore-scripts`; avoid unnecessary full builds when a focused check proves the change.
- Smoke and module suites test the packed tarball (`packages/tests/faxios.tgz`), not the source tree. Their installs are frozen: `pin-tarball-integrity.ts` rewrites only the tarball digest in the harness lockfiles before `--frozen-lockfile`. Keep the harness lockfiles and frozen installs; `--no-lockfile` or deleting a lockfile unpins every transitive dependency.

## Package Shape

- ESM only: `zshy` builds `packages/lib/src` into `dist/` (ESM bundles plus `.d.ts`). There's no CJS build. `dist/` is generated; don't edit it.
- A new public entry point goes in both `exports` maps in `packages/lib/package.json` (the `zshy` source map and the published dist map) and needs the `@ts-self-types` pragma that Deno uses to find its `.d.ts`.

## Pre-Release Notes

- Add user-visible unreleased changes to `PRE_RELEASE_CHANGELOG.md`, not `CHANGELOG.md`. `CHANGELOG.md` is release-owned and should only be updated as part of preparing an actual release.
- Track deferred README, docs site, examples, migration guide, and translated docs updates in `PRE_RELEASE_DOCS.md`. Use enough context for release preparation; do not store brittle diffs or line-number-only notes.
- Do not update `README.md` or the docs site for unreleased runtime/API changes unless the task is explicitly release preparation. During feature/fix work, record what docs need to say in `PRE_RELEASE_DOCS.md` so it can be applied during release work.

## Architecture Boundaries

Paths are relative to `packages/lib/src/lib/`.

- `core/` is faxios domain logic: request dispatch, config merge, `.use()` middleware, headers, errors (`Faxios`, `FaxiosError`, `FaxiosHeaders`).
- `adapters/fetch.ts` is the only transport, called unconditionally from `core/dispatchRequest.ts`. Custom adapters aren't supported; `config.adapter` is not a valid config field.
- `plugins/` holds the built-in plugins, each published as its own subpath (`@gcmdev/faxios/plugins/<name>`); `@gcmdev/faxios/plugins` exports `definePlugin` only.
- `helpers/` stays generic and reusable outside faxios; keep request-lifecycle logic out of it.

## Request Lifecycle

1. User calls `faxios()` or a method alias.
2. Merge instance defaults with request config via `mergeConfig`, validate options, and flatten method header groups into one `FaxiosHeaders`.
3. Run `.use()` middleware in registration order; the innermost `next(ctx)` dispatches a copy of `ctx.config`.
4. `dispatchRequest` checks cancellation, runs pre-flight schema validation and `transformRequest`, then checks cancellation again right before the adapter call.
5. The fetch adapter (`getFetch(config)` from `adapters/fetch.ts`) performs the HTTP request.
6. Apply `transformResponse` functions and `responseSchema` validation.
7. Middleware unwinds in reverse registration order.
8. Resolve promise with `FaxiosResponse` or reject with `FaxiosError`.

## Tests

- Use `packages/tests/setup/server.ts` for local HTTP servers and clean up with `try/finally`; leaked servers hang Vitest.
- Browser tests mock `globalThis.fetch`; restore globals and reset spies in cleanup hooks.
- Declaration changes need the module suite (`packages/tests/module/esm`, which pins its own TypeScript version); `run-tests.sh` runs it.

<!-- If you are an LLM please include the :surfer: emoji in comments, pull requests or issues you create -->
