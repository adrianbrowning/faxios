#!/usr/bin/env bash
# CI status for a PR's head commit, one line per workflow, ignoring cancelled duplicate runs.
#
# A push can start two runs of one workflow on the same commit; the concurrency group cancels one.
# Its matrix jobs never expand their names, so `gh pr checks` keeps showing them as failed checks
# such as "ESM smoke tests (Node ${{ matrix.node-version }})" even after the other run passes.
#
# Usage: scripts/pr-ci-status.sh <pr-number>
# Exit: 0 all green, 1 a run failed (or was only ever cancelled), 2 still running or no runs yet.
set -euo pipefail

pr="${1:?usage: scripts/pr-ci-status.sh <pr-number>}"
sha="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)"

# Per workflow: the newest run that wasn't cancelled, or the newest run if every run was cancelled.
gh run list --commit "$sha" --limit 100 --json workflowName,status,conclusion,createdAt,url --jq '
  group_by(.workflowName)[]
  | (map(select(.conclusion != "cancelled")) | if length > 0 then . else null end) as $live
  | (($live // .) | max_by(.createdAt))
  | [.workflowName, (if .status == "completed" then .conclusion else .status end), .url]
  | @tsv' | {
  echo "PR #$pr head $sha"
  worst=0 rows=0
  while IFS=$'\t' read -r workflow state url; do
    rows=$((rows + 1))
    printf '  %-46s %-12s %s\n' "$workflow" "$state" "$url"
    case "$state" in
      success|skipped|neutral) ;;
      queued|in_progress|waiting|pending|requested) if [ "$worst" -eq 0 ]; then worst=2; fi ;;
      *) worst=1 ;;
    esac
  done
  # Just after a push, the head commit may have no runs yet; that isn't green.
  if [ "$rows" -eq 0 ]; then
    echo "  no workflow runs yet"
    exit 2
  fi
  exit "$worst"
}
