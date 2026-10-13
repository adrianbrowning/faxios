# @faxios/bench

Compares native Fetch, Axios and the packed faxios on three endpoints: a basic JSON request, a validated endpoint and a validated endpoint with retries. The results feed the generated docs page [`packages/docs/pages/misc/comparison.md`](../docs/pages/misc/comparison.md).

## Regenerate everything

From the repository root:

```sh
pnpm bench
```

It builds and packs faxios, pins the tarball's integrity in this harness's lockfile, installs it frozen, then runs `size`, `runtime` and `report` below and restores the lockfile. Commit `results/` and the docs page it rewrites.

## Layout

- `fixtures/<client>/<stage>.ts`: what is measured, one file per client and stage, with the shared zod schemas in `fixtures/schemas.ts`. `fixtures/deps/` holds the dependency-only bundles.
- `tests/`: correctness tests for every fixture (local servers, a replaced `globalThis.fetch`, a fake clock). `pnpm check` runs them through `pnpm --filter @faxios/tests test:bench`, which also type-checks the harness with the workspace's TypeScript.
- `.size-limit.ts` and `scripts/size.ts`: bundle sizes (raw, minified, gzip, Brotli) into `results/size.json`. No check sets a limit: these numbers never fail a run.
- `scripts/runtime.ts`: tinybench, in memory and against a local server, into `results/runtime.json`. `BENCH_TIME_MS` and `BENCH_WARMUP_MS` override the per-task budgets.
- `scripts/report.ts`: renders the docs page from the two result files.

This directory is outside the pnpm workspace. Install it only with `--frozen-lockfile --ignore-workspace --ignore-scripts` after staging `packages/tests/faxios.tgz`, as `run-tests.sh` does; `.npmrc` repeats the workspace's supply-chain settings, which `--ignore-workspace` would otherwise drop.
