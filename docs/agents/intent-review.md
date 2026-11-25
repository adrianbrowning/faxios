# Per-PR Intent review

`check-skills` (`validate / Validate intent skills`) fails a PR with any pending Intent review item, so every PR whose changes Intent tracks, each stacked PR included, records its own review. CI checks against the PR base, so `<base>` is `$(git merge-base origin/main HEAD)` for a PR against main and `$(git merge-base <parent branch> HEAD)` for a stacked PR.

1. Run `pnpm exec intent maintainer review --base <base> --json > .intent/review.json`. `.intent/**` is outside Intent's review.
2. In that report, set `outcome`, `reason` and `evidence` on the items whose files this PR changed. Leave every other item unannotated: the list can include skill and planning items outside the diff.
3. Run `pnpm exec intent maintainer review --record .intent/review.json` (it takes no `--base`), then delete `.intent/review.json`. When step 2 annotated no item, skip `--record` (Intent refuses a report that annotates none of its items), delete `.intent/review.json` and handle the remaining items as the closing paragraph says. After any further edit, start again at step 1: recording rejects an item whose files changed since the report.
4. Commit `.intent/review-state.json` in the PR's last commit, and confirm `pnpm exec intent maintainer check --base <base>` passes.

An item left unannotated still fails that check. When an untracked file the workflow made caused it, delete that file (only files the workflow made, never the user's) and start again at step 1. When the item belongs to a lower stack layer, record it in that layer. A `sources:` edit in a SKILL.md also lists the files it newly covers or uncovers on the skill and planning items, so `scripts/intent-restack.sh record` leaves those items pending: record them by hand.
