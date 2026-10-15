# Contributing

We accept community contributions. By contributing to faxios, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).

Two files hold the rules, and this page only points at them:

- [AGENTS.md](AGENTS.md): setup, commands, package shape, architecture, tests, bump files and releases.
- [CODING_STANDARDS.md](CODING_STANDARDS.md): how to write and review library code. ESLint (`pnpm lint`) enforces the style.

## Setup

You need Node.js 24 or later, pnpm 10 (the version in `packageManager` in `package.json`; `corepack enable` installs it), [Deno](https://deno.com/) and [Bun](https://bun.sh/). `pnpm check` runs the Deno and Bun smoke suites.

```bash
pnpm install --frozen-lockfile
pnpm exec husky
pnpm --filter @faxios/tests exec playwright install
```

The repo `.npmrc` sets `ignore-scripts=true`, so the install doesn't set up the git hooks; `pnpm exec husky` does. Playwright downloads the Chromium, Firefox and WebKit builds the browser tests run in.

## Checking a change

```bash
pnpm check
```

`pnpm check` runs what CI runs: lint, knip, `packages/tests/run-tests.sh` (build, pack, then the unit, browser, smoke, module, Deno and Bun suites) and the docs examples. While you iterate, run one test file:

```bash
pnpm --filter @faxios/tests exec vitest run --project unit unit/core/mergeConfig.test.ts
```

Add or update tests for your change. [packages/tests/README.md](packages/tests/README.md) says where each kind of test goes. Pull requests must pass GitHub Actions.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): summary`. A `commit-msg` hook runs commitlint with the rules in `commitlint.config.js`.

## Changelog and docs

A pull request that changes the published package (`packages/lib`) in a way users can see needs a bump file. Run `pnpm bump` (`bumpy add`), choose `patch`, `minor` or `major`, and write the changelog text. Commit the new file in `.bumpy/` with your change. `pnpm bump:status` shows the pending release plan. The bumpy check on the pull request shows the planned version, and warns when a bump file is missing.

Don't edit `packages/lib/CHANGELOG.md`. bumpy writes it when maintainers release.

Update `README.md` and the [documentation](https://adrianbrowning.github.io/faxios/) in the same pull request as the change they describe. The site deploys only when a release is published, so nothing goes live early. To preview the site:

```bash
pnpm --filter @faxios/docs docs:dev
```

## Dependency and GitHub Actions updates

Please do not open pull requests that only update npm packages, lockfiles, or GitHub Actions versions. We close these PRs from outside collaborators. Only maintainers and approved automated bots may create package and GitHub Actions update PRs.

We keep the 7-day Dependabot delay for these updates unless a critical vulnerability requires a maintainer-led manual update.
