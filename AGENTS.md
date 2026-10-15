<!-- intent-maintainer:start -->
## Library Skill Maintenance

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before substantial library source, documentation, examples, tests, or skill work, run `pnpm exec intent meta generate-skill` and follow the packaged maintainer procedure.
Use the current request and repository evidence. For initial skills, propose a useful batch and reuse any scope already agreed with the maintainer.
Before handing off a skill batch or library change, run `pnpm exec intent maintainer review --json`. Follow the maintainer procedure to update affected guidance, run task checks, and record completed review outcomes. Report an evidence-backed no-op or missing evidence explicitly.
Create and incrementally maintain domain_map.yaml, skill_spec.md, and skill_tree.yaml in the established artifact location for every skill batch. Preserve prior tasks, maintainer decisions, and remaining work.
Keep maintainer decisions and changes in the repository; do not require the user to repeat the procedure in later sessions.
Use intent maintainer setup to initialize missing records, maintainer add to register skills, maintainer status to identify work, and maintainer sync to update generated metadata. Finish with intent maintainer check.
<!-- intent-maintainer:end -->

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
- Smoke and module suites test the packed tarball (`packages/tests/faxios.tgz`), not the source tree. Their installs are frozen: `pin-tarball-integrity.ts` rewrites only the tarball's digest (and, in pnpm lockfiles, its version) in the harness lockfiles before `--frozen-lockfile`, so a release doesn't have to edit them. Keep the harness lockfiles and frozen installs; `--no-lockfile` or deleting a lockfile unpins every transitive dependency.
- Every tracked lockfile is one an install reads: the root `pnpm-lock.yaml` and the harness lockfiles (`smoke/esm` and `module/esm` `pnpm-lock.yaml`, `smoke/bun/bun.lock`, `smoke/deno/deno.lock`). Each has a Dependabot entry in `.github/dependabot.yml` and a `--audit-level=high` audit in `.github/workflows/lockfile-lint.yml`; `.github/scripts/check-lockfile-coverage.mjs` fails CI when a lockfile is missing from either (`deno.lock` is its one listed exception). Delete a lockfile that nothing installs from instead of covering it. The harnesses install with `--ignore-workspace`, so the workspace `overrides` don't reach them; fix a vulnerable transitive dependency there with `pnpm --dir <harness> update --ignore-workspace --lockfile-only --depth Infinity <pkg>`.
- Dependabot has no Deno ecosystem, so update `smoke/deno/deno.lock` by hand: change the exact version in `deno.json`, then run `deno install --frozen=false` in `packages/tests/smoke/deno`. `deno.json` sets `lock.frozen`, so every other Deno install and test fails when `deno.lock` would change.

## Package Shape

- ESM only: `zshy` builds `packages/lib/src` into `dist/` (ESM bundles plus `.d.ts`). There's no CJS build. `dist/` is generated; don't edit it.
- A new public entry point goes in both `exports` maps in `packages/lib/package.json` (the `zshy` source map and the published dist map) and needs the `@ts-self-types` pragma that Deno uses to find its `.d.ts`.

## Changes And Releases

- A user-visible change to `packages/lib` needs a bump file in `.bumpy/` in the same PR. Create it with `pnpm bump` (`bumpy add`), or with the bumpy `add-change` skill (`node_modules/@varlock/bumpy/skills/add-change/SKILL.md`). Its text becomes the changelog entry. For a PR that changes `packages/lib` but needs no release, add an empty one with `pnpm exec bumpy add --empty`.
- Don't edit `packages/lib/CHANGELOG.md` by hand. bumpy writes it in the Version Packages PR, and merging that PR publishes the release.
- Update `README.md`, the docs site and examples in the same PR as the change they describe. The docs are English-only. The site deploys only when a release is published, so editing pages on `main` publishes nothing early.

## Architecture Boundaries

Paths are relative to `packages/lib/src/lib/`.

- `core/` is faxios domain logic: request dispatch, config merge, `.use()` middleware, headers, errors (`Faxios`, `FaxiosError`, `FaxiosHeaders`).
- `adapters/fetch.ts` is the only transport, called unconditionally from `core/dispatchRequest.ts`. Custom adapters aren't supported; `config.adapter` is not a valid config field.
- `plugins/` holds the built-in plugins, each published as its own subpath (`@gcmdev/faxios/plugins/<name>`); `@gcmdev/faxios/plugins` exports `definePlugin` only. Files in `plugins/` import only the package root (`src/index.ts`) and each other, so a third-party plugin can do anything a built-in one does; `lint:esl` rejects other imports.
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
