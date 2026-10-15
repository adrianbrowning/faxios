# Collaborator guide

As a collaborator, you help administer faxios. This guide covers the responsibilities that come with that access. The technical rules (setup, architecture, tests, bump files, releases) are in [AGENTS.md](./AGENTS.md), and the rules for writing and reviewing library code are in [CODING_STANDARDS.md](./CODING_STANDARDS.md). This guide doesn't repeat them.

## Code of conduct

Read the [Code of Conduct](./CODE_OF_CONDUCT.md) and help enforce it. Keep the community friendly and welcoming.

## Triage issues

- Apply appropriate labels and respond as needed.
- For bug reports, ask for a minimal reproduction (faxios version, environment, request/response details) before deeper triage.
- If an issue is not directly about faxios, convert it to a discussion.
- Close issues only when they are resolved, a fix is merged, the report lacks enough detail or a reproduction, or the reporter requests closure. Do not close issues for inactivity. We want to keep the history and respond if more information comes in later.

## Answer questions

Be helpful and patient. If a question comes from unclear docs, update the docs and consider adding an example instead of only answering in the thread. You are not expected to teach JavaScript or unrelated tooling. Redirect those questions politely.

## Review PRs

When reviewing a PR, make sure:

- The change fits within faxios. Decline features early and kindly when they belong in user code or a plugin.
- It follows [AGENTS.md](./AGENTS.md) and [CODING_STANDARDS.md](./CODING_STANDARDS.md), and `pnpm check` passes in CI. Do not merge red PRs.
- Security-sensitive changes get extra scrutiny and focused regression tests. Consult [THREATMODEL.md](./THREATMODEL.md).
- Removed functionality and breaking changes are called out in the PR description.
- PR titles use [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `chore:`, `docs:`, etc.).
- Package, lockfile, and GitHub Actions update PRs come from maintainers or approved bots. Close PRs from outside collaborators that only update npm packages, lockfiles, or GitHub Actions versions.

At least one maintainer must review and approve a PR before merge. If you are unsure about the impact of a change, ask for a second opinion. Bug fixes need a test that reproduces the issue and verifies the fix.

To release, merge the Version Packages PR that bumpy keeps up to date on `main` (see "Changes And Releases" in [AGENTS.md](./AGENTS.md)). Nothing waits for approval on npm, so review the Version Packages PR like any other.

If changes are requested, address them promptly. If you cannot make the changes, say so clearly so someone else can pick them up.

> [!IMPORTANT]
> We wait up to 28 days for a response to requested changes before closing the PR as stale. After that, we will either address the issue in a maintainer-led PR or open an issue for other contributors. If the author wants to continue the work, they should recreate the PR from the latest version of the correct target branch, address all feedback, and request review from a maintainer.

## Security disclosures

If someone reports a suspected vulnerability in a public issue, do not discuss specifics in the thread. Redirect them to the process described in [SECURITY.md](./SECURITY.md) (GitHub security advisories) and close or hide the issue as appropriate.

## What collaborators should not do

- Add runtime dependencies without discussion. The dependency surface is intentionally tiny.
- Merge package, lockfile, or GitHub Actions version update PRs from outside collaborators.
- Disable `ignore-scripts` in `.npmrc` or otherwise weaken install-time safety.
- Weaken a safeguard listed in [THREATMODEL.md](./THREATMODEL.md) without tests covering the regression cases.

---

Thanks for helping keep faxios healthy. If you are unsure about a call, ask another collaborator before acting. We would rather move a little slower than ship a regression. If you have questions about your role or responsibilities, contact the maintainers.
