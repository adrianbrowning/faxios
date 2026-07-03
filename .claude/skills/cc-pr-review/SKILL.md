---
name: cc-pr-review
description: Multi-agent PR review (local use only). Spawns 9 parallel domain-specialist teammates including bug hunter, scope/contract, and thermo-nuclear maintainability reviewers. Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1. Use cc-pr-review-ci for CI.
---

# PR Review — Multi-Agent Lead (local only)

You are the **lead**. Spawn 9 domain-specialist teammates in parallel, collect their reports via `TaskGet`, synthesize into one `gh pr comment`.

*If no PR number provided, diff against `origin/main` instead.*

## Step 1 — Gather PR data (run once, share with all reviewers)

- PR number given:
  - Run `gh pr view <N>` → capture output
  - Run `gh pr diff <N>` → capture output
  - Run `gh pr diff <N> --name-only` → capture output
- No PR number:
  - Skip `gh pr view`
  - Run `git diff origin/main` → capture output (use as diff)
  - Run `git diff origin/main --name-only` → capture output

Write all captured output to `/tmp/pr-review-data.md` in this format:
```
## PR METADATA
<gh pr view output, or "N/A — local diff">

## DIFF
<full diff output>

## CHANGED FILES
<name-only output>
```

Note this file path as `{DATA_FILE}` — you'll embed it in each teammate's spawn prompt instead of a shell command.

## Step 2 — Create team + tasks

```
TeamCreate { team_name: "pr-review" }

TaskCreate { subject: "skills index",       description: "pending" }
TaskCreate { subject: "security review",    description: "pending" }
TaskCreate { subject: "performance review", description: "pending" }
TaskCreate { subject: "react-ts review",    description: "pending" }
TaskCreate { subject: "testing review",     description: "pending" }
TaskCreate { subject: "devops review",      description: "pending" }
TaskCreate { subject: "holistic review",    description: "pending" }
TaskCreate { subject: "thermo review",      description: "pending" }
TaskCreate { subject: "bug review",         description: "pending" }
TaskCreate { subject: "scope review",       description: "pending" }
```

Note the 10 task IDs returned. The first is the skills index task — note it as `{SKILL_TASK_ID}`.

## Step 2.5 — Build skills index (lead does this directly, BEFORE spawning reviewers)

Do this yourself — no subagent needed.

1. Glob all SKILL.md files in both locations:
   - `$HOME/.claude/skills/*/SKILL.md`
   - `.claude/skills/*/SKILL.md`
2. For each file found, Read it and extract only the frontmatter block (between the `---` markers).
3. Build a manifest. Format each entry as:
   ```
   **{name}** — {description}
   path: {absolute_path_to_SKILL.md}
   ```
4. Store it:
   ```
   TaskUpdate {
     taskId: "{SKILL_TASK_ID}",
     status: "completed",
     description: "SKILLS INDEX\n\n{full manifest}"
   }
   ```

Do NOT spawn reviewers until this TaskUpdate is complete.

## Step 3 — Spawn 9 teammates in parallel (model: sonnet)

Spawn all 6 simultaneously. Replace `{DIFF_COMMAND}`, `{TASK_ID}`, and `{SKILL_TASK_ID}` with actual values.

**IMPORTANT:** Always spawn reviewer agents with `mode: "bypassPermissions"` so they never block on file-read permission dialogs.

**Preamble for all reviewers** — each spawn prompt starts with this skills-loading step:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Review the index and identify skills relevant to your domain/role
   c. Read the full SKILL.md for each relevant skill and follow its guidance throughout your review
```

**sec-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Review the index. Your domain is: security. Load any skills relevant to security, auth, OWASP, vulnerabilities.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/security.md — it contains your full instructions and checklist.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list.
3. Analyze the diff section line by line against every item in your checklist.
4. Reference specific file paths and line numbers from the diff in your findings.
Your task ID: {SEC_TASK_ID}
When done: TaskUpdate { taskId: "{SEC_TASK_ID}", status: "completed", description: "DOMAIN: security\n[your full findings]" }
```

**perf-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Your domain is: performance. Load any skills relevant to performance, optimization, async, rendering, bundles.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/performance.md — it contains your full instructions and checklist.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list.
3. Analyze the diff section line by line against every item in your checklist.
4. Reference specific file paths and line numbers from the diff in your findings.
Your task ID: {PERF_TASK_ID}
When done: TaskUpdate { taskId: "{PERF_TASK_ID}", status: "completed", description: "DOMAIN: performance\n[your full findings]" }
```

**ts-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Your domain is: React/TypeScript. Load any skills relevant to React, TypeScript, components, hooks, types, patterns.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/react-ts.md — it contains your full instructions and checklist.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list.
3. Analyze the diff section line by line against every item in your checklist.
4. Reference specific file paths and line numbers from the diff in your findings.
Your task ID: {TS_TASK_ID}
When done: TaskUpdate { taskId: "{TS_TASK_ID}", status: "completed", description: "DOMAIN: react-ts\n[your full findings]" }
```

**test-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Your domain is: testing. Load any skills relevant to testing, TDD, test patterns, assertions, coverage.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/testing.md — it contains your full instructions and checklist.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list.
3. Analyze the diff section line by line against every item in your checklist.
4. Reference specific file paths and line numbers from the diff in your findings.
Your task ID: {TEST_TASK_ID}
When done: TaskUpdate { taskId: "{TEST_TASK_ID}", status: "completed", description: "DOMAIN: testing\n[your full findings]" }
```

**devops-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Your domain is: devops/CI. Load any skills relevant to CI/CD, pipelines, build config, git, deployment.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/devops.md — it contains your full instructions and checklist.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list (## CHANGED FILES section).
3. Analyze the diff against every item in your checklist — especially event expression correctness and file duplication.
4. Use Glob or Bash to cross-reference newly added files against the rest of the repo to detect duplicates.
5. Reference specific file paths and line numbers from the diff in your findings.
Your task ID: {DEVOPS_TASK_ID}
When done: TaskUpdate { taskId: "{DEVOPS_TASK_ID}", status: "completed", description: "DOMAIN: devops\n[your full findings]" }
```

**holistic-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Your domain is: holistic/architecture. Load any skills with broad applicability — best practices, architecture, patterns, accessibility, i18n.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/holistic.md — it contains your full instructions.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list.
3. Group changed files by type (use ## CHANGED FILES section). Identify repeated patterns across files.
4. Ask the cross-cutting questions from your instructions against what you observe.
5. Reference specific files in your findings.
Your task ID: {HOLISTIC_TASK_ID}
When done: TaskUpdate { taskId: "{HOLISTIC_TASK_ID}", status: "completed", description: "DOMAIN: holistic\n[your full findings]" }
```

**thermo-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Your domain is: maintainability/structural quality. Load any skills relevant to code quality, DRY, architecture, abstractions, testability.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/thermo.md — it contains your full instructions and all 8 review lenses.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list.
3. Apply all 8 lenses from your instructions line by line across the diff.
4. Ask the core questions for every changed file: can this be deleted? simpler? is the vertical slice clear? does the feature have a clean owner?
5. Reference specific file paths and line numbers from the diff in your findings.
6. Use severity mapping from thermo.md to output findings in cc-pr-review format (Critical/High/Observation).
Your task ID: {THERMO_TASK_ID}
When done: TaskUpdate { taskId: "{THERMO_TASK_ID}", status: "completed", description: "DOMAIN: thermo\n[your full findings]" }
```

**bug-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Your domain is: runtime correctness / bug hunting. Load any skills relevant to correctness, error handling, null safety, race conditions.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/bug.md — it contains your full instructions and what to look for.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list.
3. For non-trivial logic changes, read the full source file to understand context beyond the diff.
4. Simulate runtime failure: trace each changed code path for null propagation, error swallowing, race conditions, missing transactions, and edge cases.
5. Reference specific file paths and line numbers from the diff in your findings.
Your task ID: {BUG_TASK_ID}
When done: TaskUpdate { taskId: "{BUG_TASK_ID}", status: "completed", description: "DOMAIN: bug\n[your full findings]" }
```

**scope-reviewer** spawn prompt:
```
0. Load relevant skills for your domain:
   a. TaskGet { taskId: "{SKILL_TASK_ID}" } — the description contains a skills index
   b. Your domain is: scope discipline / PR hygiene / contract drift. Load any skills relevant to scope management, API contracts, naming conventions.
   c. Read the full SKILL.md for each relevant skill and apply its guidance.
1. Read .claude/skills/cc-pr-review/references/scope.md — it contains your full instructions and checklist.
2. Read {DATA_FILE} — contains PR metadata, full diff, and changed file list.
3. Categorize every changed file as fix-relevant or tangential.
4. Check PR hygiene from the ## PR METADATA section (title, body structure, WIP markers).
5. Reference specific files or "PR body" in your findings.
Your task ID: {SCOPE_TASK_ID}
When done: TaskUpdate { taskId: "{SCOPE_TASK_ID}", status: "completed", description: "DOMAIN: scope\n[your full findings]" }
```

After spawning, assign each task to its teammate:
```
TaskUpdate { taskId: "<security task id>",    owner: "sec-reviewer" }
TaskUpdate { taskId: "<performance task id>", owner: "perf-reviewer" }
TaskUpdate { taskId: "<react-ts task id>",    owner: "ts-reviewer" }
TaskUpdate { taskId: "<testing task id>",     owner: "test-reviewer" }
TaskUpdate { taskId: "<devops task id>",      owner: "devops-reviewer" }
TaskUpdate { taskId: "<holistic task id>",    owner: "holistic-reviewer" }
TaskUpdate { taskId: "<thermo task id>",      owner: "thermo-reviewer" }
TaskUpdate { taskId: "<bug task id>",         owner: "bug-reviewer" }
TaskUpdate { taskId: "<scope task id>",       owner: "scope-reviewer" }
```

## Step 4 — Poll for completion

Call `TaskList` repeatedly until all 9 reviewer tasks show `status: "completed"` or the timeout is reached.

**Timeout and stall handling:**
- After each `TaskList` call, count how many tasks have changed status since the previous poll.
- If **no tasks changed status for 3 consecutive polls**, consider those tasks stalled.
- Mark stalled tasks as timed out (note which ones). Proceed with whatever completed — do NOT wait forever.
- Maximum polls: **20** (roughly 10–15 minutes at normal cadence). If still incomplete after 20 polls, proceed with available results and note missing domains in the synthesis.

Once all 9 complete (or timeout), retrieve findings:
```
TaskGet { taskId: "<security task id>" }
TaskGet { taskId: "<performance task id>" }
TaskGet { taskId: "<react-ts task id>" }
TaskGet { taskId: "<testing task id>" }
TaskGet { taskId: "<devops task id>" }
TaskGet { taskId: "<holistic task id>" }
TaskGet { taskId: "<thermo task id>" }
TaskGet { taskId: "<bug task id>" }
TaskGet { taskId: "<scope task id>" }
```

The `description` field of each completed task contains the domain findings. Skip TaskGet for any timed-out tasks and note them as "TIMED OUT — domain not reviewed" in Step 6.

## Step 5 — Validate findings (no-context agent)

Create a validation task, spawn a fresh agent with **no prior context**, and wait for it to complete before synthesizing.

```
TaskCreate { subject: "validation", description: "pending" }
```

Note the returned ID as `{VALIDATE_TASK_ID}`.

**validator** spawn prompt (replace `{DATA_FILE}`, `{VALIDATE_TASK_ID}`, and paste all 6 domain findings inline as `{ALL_FINDINGS}`):
```
You are a validation agent. You have no prior knowledge of this PR review.

Your job: given a set of review findings and the actual diff, remove any finding that cannot be substantiated by the diff.

Steps:
1. Read {DATA_FILE} — the ## DIFF section is the ground truth.
   Study the diff carefully.
2. Read the findings below. For each individual finding:
   - Check whether the referenced file path and line number exist in the diff.
   - Check whether the code pattern described is actually present in the diff.
   - If the finding references something not in the diff, or describes something incorrect, mark it for removal.
   - If uncertain, remove it. False negatives are safer than false positives.
3. Return only the surviving findings, preserving their original domain grouping and severity labels.
4. Do NOT add new findings. Do NOT rewrite findings. Only remove ones that don't hold up.

{ALL_FINDINGS}

When done: TaskUpdate { taskId: "{VALIDATE_TASK_ID}", status: "completed", description: "[validated findings, grouped by domain]" }
```

Assign and poll:
```
TaskUpdate { taskId: "{VALIDATE_TASK_ID}", owner: "validator" }
```

Poll `TaskList` until `{VALIDATE_TASK_ID}` shows `status: "completed"`, then:
```
TaskGet { taskId: "{VALIDATE_TASK_ID}" }
```

Use the `description` of this task (not the raw domain findings) as input to Step 6.

## Step 6 — Synthesize and post

1. Read `references/format.md` for the exact comment template.
2. Merge validated findings:
   - Sum counts: total Critical / High / Observations / Positives
   - Combine all Critical issues across domains
   - Combine all High issues
   - Combine all Observations
   - Deduplicate and merge Positives
3. Determine verdict:
   - Any Critical → ❌ Changes Required
   - High only → ⚠️ Approved with Suggestions
   - Observations only → ✅ Approved
4. Post single comment:
   - If PR number: `gh pr comment <N> --body "$(cat <<'EOF' ... EOF)"`
   - If local diff: print review to stdout

## Step 7 — Cleanup

`TeamDelete`.
