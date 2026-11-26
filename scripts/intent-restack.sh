#!/usr/bin/env bash
# Rebase a branch and carry its Intent review across, for stacked PRs and rebases onto a new main.
#
# Every PR writes .intent/review-state.json, so a rebase conflicts on that one file. The recorded
# reviews are also tied to the diff from the base, so a rebase leaves them pending even when the
# file merges cleanly, and check-skills (`validate / Validate intent skills`) fails on the PR.
#
#   rebase <base>               Rebase the current branch onto <base>. A conflict in
#                               .intent/review-state.json takes <base>'s copy; any other conflict
#                               stops the script with exit 3 and leaves the rebase for you to finish
#                               (then run `record`). Then records the reviews, as `record` does.
#   record <base> [<original>]  Record this layer's pending review items against the merge-base of
#                               <base> and HEAD: the ones that list changed files, all of them in
#                               the layer's diff since that merge-base. An item changed only through
#                               coverage (a SKILL.md sources edit that makes an unchanged file
#                               covered or uncovered) stays pending for a manual record
#                               (docs/agents/intent-review.md): Intent lists that file in its changed
#                               files, or, for an item with no record yet, only in its snapshot. An item with a record in
#                               <original>'s review-state.json
#                               (default: the branch's pushed tip, origin/<branch>) gets that
#                               outcome, reason and evidence again; the others get "no-change" with
#                               their changed files as evidence. It prints every other item as left
#                               pending, even one with an earlier record or no changed files, and
#                               skips recording when no item is the layer's. Then it amends the
#                               review into the last commit and runs `intent maintainer check`
#                               against the same merge-base. Use
#                               it after `gh stack rebase` or `gh stack sync`.
#   stack                       For every layer of the current gh stack, bottom first: rebase it
#                               onto the layer below (if that layer moved) and record its reviews.
#                               Use it after amending a layer, e.g. to record that layer's review.
#                               Every layer must be free to check out in this worktree. A layer
#                               whose check fails only on pending review items does not stop it:
#                               it lists those layers at the end and exits 4. Any other error stops
#                               it at that layer, a check that fails for another reason (skill
#                               validation, authoring problems, files to sync) included. A conflict
#                               outside .intent/review-state.json exits 3; finish that rebase, run
#                               `record`, then run `stack` again.
#
# Check a "no-change" outcome when the layer changes what the skill teaches. An item left pending
# still fails `intent maintainer check`; docs/agents/intent-review.md says how to handle it.
#
# Run it in the branch's worktree, bottom layer first. `record` refuses (exit 1) a modified or
# staged tracked file other than .intent/review-state.json, whose edits it would record but not
# commit, and any file on disk (untracked or ignored) at a path the layer deleted, whose content it
# would record though CI has no such file. Edits to .intent/review-state.json itself are amended
# into the layer's last commit. For a
# stack, <base> is the branch below.
# Exit: 0 done; 1 a usage error, a dirty tree, a `git rebase` that could not start, or a failed
# `intent maintainer check` other than the case for 4; 3 a conflict outside .intent/review-state.json;
# 4 only when `intent maintainer check` failed on pending review items alone (`stack` lists those
# layers). Any other failed command (gh, git, jq, intent review/record) exits with its own code, but
# an exit 4 from it becomes 1. Errors go to stderr.
set -euo pipefail

state=.intent/review-state.json
usage="usage: scripts/intent-restack.sh rebase <base> | record <base> [<original>] | stack"

in_rebase() {
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]
}

record() {
  local base="$1" original="$2" pending previous diff fork
  if [ -n "$(git status --porcelain --untracked-files=no -- . ":!$state")" ]; then
    echo "Tracked files have uncommitted changes; commit or stash them, then run again." >&2
    exit 1
  fi
  fork="$(git merge-base "$base" HEAD)"
  # Intent hashes the disk, so a file at a path the layer deleted would be recorded but absent on CI.
  local path present=()
  while IFS= read -r -d '' path; do
    if [ -e "$path" ] || [ -L "$path" ]; then present+=("$path"); fi
  done < <(git diff --no-renames --diff-filter=D --name-only -z "$fork" HEAD)
  if [ "${#present[@]}" -gt 0 ]; then
    echo "Files exist at paths this layer deleted; remove or move them, then run again:" >&2
    printf '  %s\n' "${present[@]}" >&2
    exit 1
  fi
  pending="$(mktemp)"
  previous="$(mktemp)"
  diff="$(mktemp)"
  pnpm exec intent maintainer review --base "$fork" --json > "$pending"
  if [ "$(jq '.items | length' "$pending")" = "0" ]; then
    echo "No pending review items against $base."
  else
    git show "$original:$state" > "$previous" 2> /dev/null || echo '{"items":{}}' > "$previous"
    git diff --no-renames --name-only -z "$fork" HEAD | jq -Rs 'split("\u0000") | map(select(length > 0))' > "$diff"
    # docs/agents/intent-review.md: record only this layer's items (see the header), leave the rest
    # unresolved; the script makes no ownership guess for coverage-only changes.
    jq --slurpfile previous "$previous" --slurpfile diff "$diff" \
      --slurpfile current <(cat "$state" 2> /dev/null || echo '{"items":{}}') '
      .items |= map(
        . as $item
        | ($previous[0].items[$item.id] // null) as $old
        # A new item (no record in the working tree) lists outside covered files only in its snapshot.
        | (($item.changedFiles | length) > 0 and ($item.changedFiles - $diff[0] | length) == 0
           and ($current[0].items[$item.id] or ((($item.snapshot // {}) | keys) - $diff[0] | length) == 0)) as $inLayer
        | if ($inLayer | not) then .
          elif $old then . + {outcome: $old.outcome, reason: $old.reason, evidence: $old.evidence}
          else
            . + {outcome: "no-change",
                 reason: "Rebased onto the branch below; this layer changes no guidance the skill teaches beyond what its PR describes.",
                 evidence: ["Changed files: \($item.changedFiles | join(", "))"]}
          end
      )' "$pending" > .intent/review.json
    jq -r '.items[] | "  \(.id): \(.outcome // "left pending, outside this layer")"' .intent/review.json
    if [ "$(jq '[.items[] | select(.outcome)] | length' .intent/review.json)" != "0" ]; then
      pnpm exec intent maintainer review --record .intent/review.json > /dev/null
    fi
    rm -f .intent/review.json
  fi
  rm -f "$pending" "$previous" "$diff"

  if ! git diff --quiet HEAD -- "$state"; then
    git add "$state"
    git commit --quiet --amend --no-edit
    echo "Amended the review into $(git log --oneline -1)."
  fi
}

# check_layer <base>: run `intent maintainer check` against the merge-base of <base> and HEAD, as CI
# does. Returns 0 when it passes, 4 when
# it fails on pending review items alone, 1 otherwise. Callers run it where errexit is off, so it
# tests every command's status itself; a failed `status --json` or jq counts as 1.
check_layer() {
  local base="$1" output errors fork result=1
  fork="$(git merge-base "$base" HEAD)" || return 1
  output="$(mktemp)"
  errors="$(mktemp)"
  if pnpm exec intent maintainer check --base "$fork" --artifacts _artifacts > "$output" 2> "$errors"; then
    tail -1 "$output"
    rm -f "$output" "$errors"
    return 0
  fi
  cat "$output"
  cat "$errors" >&2
  # `check` has no --json. It throws a skill validation error first and fails with "Maintainer
  # check failed." only once validation passed; `status --json` then says whether pending review
  # items, none with authoring problems of its own, alone caused that.
  if grep -q '^Maintainer check failed\.' "$errors" \
    && pnpm exec intent maintainer status --base "$fork" --artifacts _artifacts --json > "$output" \
    && jq -e '(.problems | length) == 0 and (.staleFiles | length) == 0 and (.review.items | length) > 0
      and all(.review.items[]; (.problems | length) == 0)' "$output" > /dev/null; then
    result=4
  fi
  rm -f "$output" "$errors"
  return "$result"
}

# rebase <base> [<upstream>]: replay the commits after <upstream> (default <base>) onto <base>.
rebase() {
  local base="$1" upstream="${2:-$1}" original conflicts output
  original="$(git rev-parse HEAD)"
  # A conflict stops the rebase with an error, which the loop below handles. Any other error
  # (e.g. unstaged changes) means the rebase never started: stop before recording a review.
  if ! output="$(git rebase --onto "$base" "$upstream" 2>&1)" && ! in_rebase; then
    echo "$output" >&2
    echo "git rebase failed; nothing was recorded." >&2
    exit 1
  fi
  while in_rebase; do
    conflicts="$(git diff --name-only --diff-filter=U)"
    if [ -n "$conflicts" ] && [ "$conflicts" != "$state" ]; then
      echo "Conflicts outside $state; resolve them, finish the rebase, then run:" >&2
      echo "  scripts/intent-restack.sh record $base $original" >&2
      echo "$conflicts" >&2
      exit 3
    fi
    if [ -n "$conflicts" ]; then
      git checkout --ours -- "$state"
    fi
    # rerere may already have resolved the file; stage it either way.
    git add "$state"
    if ! GIT_EDITOR=true git rebase --continue > /dev/null 2>&1; then
      if [ -z "$(git diff --name-only --diff-filter=U)" ] && git diff --cached --quiet; then
        # The commit only changed the review state, and taking the base's copy emptied it.
        git rebase --skip > /dev/null 2>&1 || true
      fi
    fi
  done
  record "$base" "$original"
}

# fail <status>: exit with <status>, but as 1 when it is 4, which only a check that failed on
# pending review items alone may return.
fail() {
  local status="$1"
  [ "$status" -eq 4 ] && status=1
  exit "$status"
}

# run_layer <base> <command...>: run <command> (rebase or record), then set layer_status to
# check_layer <base>'s status. The subshell keeps errexit on inside the command, so any failure there
# exits with that command's code; exit 4 is kept for a check that failed on pending items alone, so
# another command's 4 becomes 1. Call it bare: an `if` or `||` around the call would turn errexit
# off inside the subshell too.
run_layer() {
  local base="$1" status
  shift
  set +e
  ( set -e; "$@" )
  status=$?
  set -e
  [ "$status" -eq 0 ] || fail "$status"
  layer_status=0
  check_layer "$base" || layer_status=$?
}

stack() {
  local view trunk branch below old i
  local -a branches=() olds=() failed=()
  view="$(gh stack view --json)" || fail $?
  trunk="origin/$(jq -r '.trunk' <<< "$view")" || fail $?
  # `base` is the parent tip gh stack last saw in the branch: the commit the layer was built on.
  while IFS=$'\t' read -r branch old; do
    branches+=("$branch")
    olds+=("$old")
  done < <(jq -r '.branches[] | select(.isMerged | not) | [.name, .base] | @tsv' <<< "$view")
  for i in "${!branches[@]}"; do
    branch="${branches[$i]}"
    old="${olds[$i]}"
    below="$trunk"
    [ "$i" -gt 0 ] && below="${branches[$((i - 1))]}"
    echo "== $branch on $below"
    git checkout --quiet "$branch" || fail $?
    if [ "$i" -gt 0 ] && [ "$(git rev-parse "$below")" != "$old" ] && git merge-base --is-ancestor "$old" "$branch"; then
      run_layer "$below" rebase "$below" "$old"
    else
      run_layer "$below" record "$below" "$(git rev-parse HEAD)"
    fi
    if [ "$layer_status" -eq 4 ]; then
      failed+=("$branch")
    elif [ "$layer_status" -ne 0 ]; then
      exit "$layer_status"
    fi
  done
  if [ "${#failed[@]}" -gt 0 ]; then
    echo "intent maintainer check failed on these layers:" >&2
    printf '  %s\n' "${failed[@]}" >&2
    exit 4
  fi
}

action="${1:?$usage}"
if [ "$action" = stack ]; then
  stack
  exit 0
fi
base="${2:?$usage}"
case "$action" in
  rebase | record) ;;
  *) echo "$usage" >&2; exit 1 ;;
esac
if [ "$action" = rebase ]; then
  run_layer "$base" rebase "$base"
else
  run_layer "$base" record "$base" "${3:-origin/$(git branch --show-current)}"
fi
exit "$layer_status"
