# Contributing

We accept community contributions. By contributing to faxios, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).

## Code style

Follow the [node style guide](https://github.com/felixge/node-style-guide).

## Commit messages

Follow [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/).

## Testing

Update tests for your changes. Pull requests must pass GitHub Actions.

## Documentation

Update the [documentation](https://adrianbrowning.github.io/faxios/) when the API changes, so the API and docs stay in sync.

## Changelog

A pull request that changes the published package (`packages/lib`) in a way users can see needs a bump file. Run `pnpm bump` (`bumpy add`), choose `patch`, `minor` or `major`, and write the changelog text. Commit the new file in `.bumpy/` with your change. The bumpy check on the pull request shows the planned version, and warns when a bump file is missing.

Don't edit `packages/lib/CHANGELOG.md`. bumpy writes it when maintainers release.

## Dependency and GitHub Actions updates

Please do not open pull requests that only update npm packages, lockfiles, or GitHub Actions versions. We close these PRs from outside collaborators. Only maintainers and approved automated bots may create package and GitHub Actions update PRs.

We keep the 7-day Dependabot delay for these updates unless a critical vulnerability requires a maintainer-led manual update.

## Developing

- `npm run test` runs the Jasmine and Mocha tests
- `npm run build` runs Rollup and bundles the source
- `pnpm bump:status` shows the pending release plan

## Running examples

Use the examples for manual testing.

Run the examples:

```bash
> npm run examples
# Open 127.0.0.1:3000
```

Run the browser sandbox:

```bash
> npm start
# Open 127.0.0.1:3000
```

Run the terminal sandbox:

```bash
> npm start
> node ./sandbox/client
```
