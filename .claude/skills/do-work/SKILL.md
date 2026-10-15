---
name: do-work
description: Executes a unit of work in faxios: plan, implement, lint/type-check/test feedback loop, then commit. Use when asked to implement a feature, fix a bug, or complete a task in this repository.
---

# Do Work

Structured workflow for completing a unit of work in this repository.

## Workflow

### 1. Plan

Before touching code:
- Base the work on a fresh trunk: `git fetch origin`, then branch (or `gh stack init`) from `origin/main`. `gh stack init` uses the *local* `main`, so fast-forward it first if you stack. When other work runs at the same time, give the branch its own worktree: `git worktree add -b <branch> ../<dir> origin/main`, then `pnpm install --frozen-lockfile` in it. Driving several worktrees at once: read "Parallel worktrees" in `docs/agents/issue-tracker.md` first.
- Restate the task as a verifiable target ("done when X")
- Identify affected packages (docs, lib, tests)
- List files to create/modify
- Surface ambiguities — ask before proceeding if any exist
- For 3+ file changes or architectural decisions, use Plan mode

### 2. Implement

- Surgical changes — touch only what the task requires
- Follow existing patterns in affected package (see CLAUDE.md / AGENTS.md)
- ESM only (`type: module`); no CJS/`require`, no UMD
- Explicit extensions in relative imports. In `packages/lib/src`, `src/index.ts` imports with `.ts` (zshy rewrites them to `.js` in `dist/`) and every other file imports with `.js`. `packages/tests` sets `allowImportingTsExtensions` and imports lib source through `#src/*` with either extension. Run `.ts` directly with node (no `tsx`/`ts-node`)
- `workspace:*` for internal package deps (e.g. `packages/tests` depends on `@gcmdev/faxios` via `workspace:*`)
- TypeScript strict config via `@gingacodemonkey/config/tsc/no-dom/library`

#### Back-end code

Use **tracer-bullet TDD** with a **Make it Work → Make it Right → Make it Fast** loop:

1. **Pick one behaviour** — the smallest vertical slice that proves the feature works end-to-end
2. **RED** — write one failing test for that behaviour only. Run it, confirm it fails for the right reason
3. **GREEN (Make it Work)** — write the minimum code to pass that test. No polish, no abstraction
4. **Repeat** — next behaviour only after current slice is green + refactored
5. **REFACTOR (Make it Right)** — clean up without changing behaviour; tests must stay green
6. **Make it Fast** — only after all behaviours are green and clean; profile before optimising

Rules:
- One test at a time — never write a second failing test while one is already red
- Tracer bullet first: get a thin path from input → output → network response before filling in edge cases
- If a test proves impossible to write cleanly, the design is wrong — fix the design
- A behaviour change breaks the tests that pin the old behaviour, and they are not only unit tests. Grep `packages/tests/{browser,smoke,module,docs-examples}` for the behaviour and update what pins it in the same commit.

#### Front-end code (if any)

Skip TDD loop — implement directly, verify visually in browser. Run lint/type-check as normal.

### 3. Feedback Loop

Run what CI runs:

```bash
pnpm check
```

It runs `lint` (type-check plus the `@ts-self-types` and `@ts-expect-error` checks, `lint:esl`, then the style check `lint:s`, which reports without fixing; the docs `lint` type-checks `.vitepress` too), `docs:sync:check` (Markdown copies of `file=` sources still match them), `lint:knip`, `packages/tests/run-tests.sh` (build, pack, unit, browser headless, ESM smoke/module, Deno, Bun), `test:docs-examples` (the code blocks of every first-party Markdown file, the `contract=` declaration blocks and the API reference and Request config coverage checks) and `docs:build`. Treat any failing stage as blocking. While iterating, a focused `pnpm --filter @faxios/tests exec vitest run --project unit <file>` is faster; finish on `pnpm check`. To change a `file=` example, edit its source in `packages/tests/docs-examples/sources/`, review with `pnpm docs:sync`, then apply with `pnpm docs:sync:apply`.

`run-tests.sh` allows one run per checkout (its lock lives in that checkout's `packages/tests/`), so separate git worktrees can run `pnpm check` in parallel. It refuses to start if a harness lockfile differs from `HEAD`; follow its message rather than deleting the lock or the lockfile changes by hand.

Iterate until all pass (or a step is skipped because it does not apply).

### 4. Bump file

If the change is user-visible in `packages/lib`, add a bump file in `.bumpy/` before you commit: `pnpm bump` (`bumpy add`), or the bumpy `add-change` skill at `node_modules/@varlock/bumpy/skills/add-change/SKILL.md`. The summary becomes the changelog entry. Don't edit `packages/lib/CHANGELOG.md`; bumpy generates it. If `packages/lib` changed but needs no release, add `pnpm exec bumpy add --empty`.

### 5. Commit

Stage only files changed by this task. Write a **Conventional Commits** message — a husky `commit-msg` hook runs `commitlint` to validate this format:

```
<type>(<scope>): <short imperative summary>

[optional body — why, not what]
```

**Types:** `feat` | `fix` | `refactor` | `test` | `chore` | `docs` | `perf` | `ci`

**Scope:** package or area (`lib`, `tests`, `docs`, `ci`, `repo`)

**Examples:**
```
feat(lib): add token refresh on 401
fix(tests): stop the test server in finally
docs(docs): document the retry plugin options
```

Rules:
- Subject ≤ 72 chars, lowercase type/scope, no trailing period
- Use body for non-obvious motivation, not task IDs
- One logical change per commit
- Subject must not be start-case, pascal-case or upper-case (enforced by `commitlint.config.js`); code identifiers such as `FaxiosHeaders` inside a lower-case or sentence-case subject are fine

### 6. Hand-off

Done when the PR is open and every required check is green.

1. **Record the Intent review.** `check-skills` (`validate / Validate intent skills`) fails on any PR with a pending review item. Run `pnpm exec intent maintainer check --base origin/main --artifacts _artifacts`. If it lists items, update `packages/lib/skills/configure-requests/` when the change alters what the skill teaches and record `pnpm exec intent maintainer review --base origin/main --updated "<reason>"`; otherwise record `--unchanged "<reason>"`. Commit `.intent/review-state.json` with the change.
2. **Push and open the PR.** `gh pr create` and `gh pr edit` fail here (see `docs/agents/issue-tracker.md`), so open it with `gh api repos/adrianbrowning/faxios/pulls -f title=… -f head=<branch> -f base=main -F body=@<file> -q .html_url`. The body has a Summary, `Closes #N` (or `Part of #N` when the issue keeps a later part), each test with what it failed with before the fix, and the checks you ran. Set the issue's milestone on the PR with `gh api -X PATCH repos/adrianbrowning/faxios/issues/<PR> -F milestone=<number>`.
3. **Wait for CI.** `scripts/pr-ci-status.sh <PR>` exits 0 when every workflow is green. Fix a failure, push, and run it again.
4. **Rebase with the review.** A rebase onto a new `main` or a lower stack layer conflicts on `.intent/review-state.json` and leaves the review pending. Run `scripts/intent-restack.sh rebase <base>` in the branch's worktree, or `scripts/intent-restack.sh record <base>` after `gh stack rebase`.
