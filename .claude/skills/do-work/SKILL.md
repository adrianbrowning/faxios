---
name: do-work
description: Executes a unit of work in faxios: plan, implement, lint/type-check/test feedback loop, then commit. Use when asked to implement a feature, fix a bug, or complete a task in this repository.
---

# Do Work

Structured workflow for completing a unit of work in this repository.

## Workflow

### 1. Plan

Before touching code:
- Restate the task as a verifiable target ("done when X")
- Identify affected packages (docs, examples, lib, sandbox, tests)
- List files to create/modify
- Surface ambiguities — ask before proceeding if any exist
- For 3+ file changes or architectural decisions, use Plan mode

### 2. Implement

- Surgical changes — touch only what the task requires
- Follow existing patterns in affected package (see CLAUDE.md / AGENTS.md)
- ESM only (`type: module`); no CJS/`require`, no UMD
- Explicit `.js` extensions in imports; run `.ts` directly with node (no `tsx`/`ts-node`)
- `workspace:*` for internal package deps (e.g. `packages/tests` depends on `faxios` via `workspace:*`)
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

#### Front-end code (if any)

Skip TDD loop — implement directly, verify visually in browser. Run lint/type-check as normal.

### 3. Feedback Loop

Run in order, fix before proceeding to next:

```bash
pnpm -r lint:ts && echo "---" && pnpm -r lint:fix && (cd packages/tests/ && ./run-tests.sh)
```

`lint:fix` autofixes style issues in place; re-run `lint:ts` after fixes touch typed code. `run-tests.sh` builds `faxios`, packs it into the smoke/module suites, then runs unit, browser-headless, ESM smoke/module, Deno, and Bun tests in sequence — treat any failing stage as blocking.

Iterate until all pass (or a step is skipped because it does not apply).

### 4. Commit

Stage only files changed by this task. Write a **Conventional Commits** message — a husky `commit-msg` hook runs `commitlint` to validate this format:

```
<type>(<scope>): <short imperative summary>

[optional body — why, not what]
```

**Types:** `feat` | `fix` | `refactor` | `test` | `chore` | `docs` | `perf` | `ci`

**Scope:** package name or domain (`lib`, `tests`, `docs`, `examples`, `sandbox`)

**Examples:**
```
feat(auth): add token refresh on 401
fix(worker): prevent duplicate message deletion on retry
refactor(api): extract request-validation into shared util
chore(deps): upgrade prisma to 6.x
```

Rules:
- Subject ≤ 72 chars, lowercase type/scope, no trailing period
- Use body for non-obvious motivation, not task IDs
- One logical change per commit
- Subject case must be sentence-case or lower-case (enforced by `commitlint.config.js`)
</content>
