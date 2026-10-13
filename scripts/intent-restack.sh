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
#   record <base> [<original>]  Record every pending review item against <base>, copying outcome,
#                               reason and evidence from <original>'s review-state.json (default:
#                               the branch's pushed tip, origin/<branch>), and amend it into the
#                               last commit. Use it after `gh stack rebase` or `gh stack sync`.
#
# A pending item with no earlier record is recorded as "no-change" with its changed files as
# evidence. Check that outcome when the layer changes what the skill teaches.
#
# Run it in the branch's worktree, bottom layer first. For a stack, <base> is the branch below.
# Exit: 0 done, 1 error, 3 a conflict outside .intent/review-state.json.
set -euo pipefail

state=.intent/review-state.json
usage="usage: scripts/intent-restack.sh rebase <base> | record <base> [<original>]"

in_rebase() {
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]
}

record() {
  local base="$1" original="$2" pending previous
  pending="$(mktemp)"
  previous="$(mktemp)"

  # Exits non-zero while items are pending; the JSON report is what's needed.
  pnpm exec intent maintainer review --base "$base" --json > "$pending" 2> /dev/null || true
  if [ "$(jq '.items | length' "$pending")" = "0" ]; then
    echo "No pending review items against $base."
  else
    git show "$original:$state" > "$previous" 2> /dev/null || echo '{"items":{}}' > "$previous"
    jq --slurpfile previous "$previous" '
      .items |= map(
        . as $item
        | ($previous[0].items[$item.id] // null) as $old
        | . + (if $old then {outcome: $old.outcome, reason: $old.reason, evidence: $old.evidence}
               else {outcome: "no-change",
                     reason: "Rebased onto the branch below; this layer changes no guidance the skill teaches beyond what its PR describes.",
                     evidence: ["Changed files: \($item.changedFiles | join(", "))"]} end)
      )' "$pending" > .intent/review.json
    jq -r '.items[] | "  \(.id): \(.outcome)"' .intent/review.json
    pnpm exec intent maintainer review --record .intent/review.json > /dev/null
    rm -f .intent/review.json
  fi
  rm -f "$pending" "$previous"

  if ! git diff --quiet -- "$state"; then
    git add "$state"
    git commit --quiet --amend --no-edit
    echo "Amended the review into $(git log --oneline -1)."
  fi
  pnpm exec intent maintainer check --base "$base" --artifacts _artifacts | tail -1
}

rebase() {
  local base="$1" original conflicts
  original="$(git rev-parse HEAD)"
  git rebase "$base" > /dev/null 2>&1 || true
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

action="${1:?$usage}"
base="${2:?$usage}"
case "$action" in
  rebase) rebase "$base" ;;
  record) record "$base" "${3:-origin/$(git branch --show-current)}" ;;
  *) echo "$usage" >&2; exit 1 ;;
esac
