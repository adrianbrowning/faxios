# Test contribution guide

Every test harness for faxios lives in this package (`@faxios/tests`). The repo-wide test rules are in [AGENTS.md](../../AGENTS.md) ("Tests") and [CODING_STANDARDS.md](../../CODING_STANDARDS.md) ("Tests"); this page says where a test goes and which helpers to use.

Run everything with `pnpm check` from the repo root. It runs [run-tests.sh](run-tests.sh), which builds `packages/lib`, packs it into `faxios.tgz`, installs that tarball into the smoke and module harnesses, and runs every suite below.

## Layout

| Directory | Suite | Runs against | How it runs |
| --- | --- | --- | --- |
| [unit/](unit/) | Node behaviour tests | lib source through `#src/*` | `vitest run --project unit` |
| [browser/](browser/) | Browser behaviour tests | lib source through `#src/*` | `vitest run --project browser-headless` (Chromium, Firefox, WebKit) |
| [smoke/esm/](smoke/esm/) | Node ESM package smoke tests | the packed tarball | `pnpm test:smoke:esm:vitest` |
| [smoke/deno/](smoke/deno/) | Deno smoke tests and type checks | the packed tarball | `pnpm test:smoke:deno` |
| [smoke/bun/](smoke/bun/) | Bun smoke tests | the packed tarball | `pnpm test:smoke:bun` |
| [module/esm/](module/esm/) | Declaration and packaging tests (own TypeScript version) | the packed tarball | `pnpm test:module:esm` |
| [docs-examples/](docs-examples/) | Code blocks from the READMEs, migration guide, agent skills and docs pages, type-checked and run | the built `lib/dist` | `pnpm test:docs-examples` |
| [setup/](setup/) | Shared helpers | | |
| [eslint-rules/](eslint-rules/) | Lint rules for this package (tests in `unit/eslint-rules/`) | | |
| [scripts/](scripts/) | `lint:ts` checks and release helpers | | |

The test projects are defined in [vitest.config.js](vitest.config.js). To run one file while you iterate:

```bash
pnpm --filter @faxios/tests exec vitest run --project unit unit/core/mergeConfig.test.ts
```

## File names

Every test is TypeScript:

- Unit: `unit/**/*.test.ts`
- Browser: `browser/**/*.browser.test.ts`
- Smoke: `smoke/{esm,deno,bun}/tests/*.smoke.test.ts`
- Module: `module/esm/tests/*.module.test.ts`

## Unit (`unit/`)

- Import lib internals through `#src/*` (mapped to `../lib/src/*` in [tsconfig.json](tsconfig.json)), for example `import mergeConfig from "#src/lib/core/mergeConfig.js";`.
- Tests that need a real HTTP server start one with `startHTTPServer` from [setup/server.ts](setup/server.ts) and stop it with `stopHTTPServer` in `finally` (or `afterEach`/`afterAll`). A leaked server hangs Vitest, and the `faxios/test-server-cleanup` lint rule rejects a test that doesn't stop it. Servers bind `127.0.0.1` on port 0; `faxios/no-fixed-test-port` rejects a fixed port. `startHTTPServer` rejects on a bind error such as `EADDRINUSE`, and `stopHTTPServer` rejects when the server does not close before its timeout.
- Use fake timers (`vi.useFakeTimers()`) or a test-held response instead of real sleeps, and an injected `env.fetch` or a local server instead of the network.
- Keep fixtures next to the tests that use them, for example [unit/adapters/faxios.png](unit/adapters/faxios.png) and [unit/core/_schemaTestHelpers.ts](unit/core/_schemaTestHelpers.ts).
- Keep each test module under 1,000 lines. Split a large suite by behaviour, as [unit/adapters/fetch/](unit/adapters/fetch/) does (`responses`, `auth`, `cancellation`, `progress`, `size-limits`, ...).
- Put a prototype-pollution regression next to the component it protects, for example [unit/core/mergeConfig.pollution.test.ts](unit/core/mergeConfig.pollution.test.ts). [unit/prototypePollution.test.ts](unit/prototypePollution.test.ts) keeps only scenarios that cross layers through a full request.
- In a new suite that pollutes `Object.prototype`, call `restorePrototypeAfterEach()` from [setup/pollution.ts](setup/pollution.ts). It snapshots `Object.prototype` before each test and restores it afterwards, even when the test throws. `ObjProto` and `assertClean` plant and check polluted keys. A test that must remove the key before an assertion may clean up in its own `try/finally`.

Representative files: [unit/adapters/fetch.test.ts](unit/adapters/fetch.test.ts) and [unit/adapters/fetch/](unit/adapters/fetch/), [unit/core/mergeConfig.test.ts](unit/core/mergeConfig.test.ts), [unit/regression.test.ts](unit/regression.test.ts).

## Browser (`browser/`)

- Mock `globalThis.fetch` with `installFetchMock` from [browser/helpers/fetchMock.ts](browser/helpers/fetchMock.ts). It restores the original `fetch` on dispose, so declare it with `using`.
- Restore every global you replace and reset spies in cleanup hooks. [setup/browser.setup.ts](setup/browser.setup.ts) clears the DOM after each test.
- Real uploads go to the `/__faxios/upload` endpoint that [vitest.config.js](vitest.config.js) adds to the Vitest browser server.

Representative files: [browser/headers.browser.test.ts](browser/headers.browser.test.ts), [browser/cancel.browser.test.ts](browser/cancel.browser.test.ts), [browser/defaults.browser.test.ts](browser/defaults.browser.test.ts).

## Smoke (`smoke/`)

Smoke tests check that the published package imports and makes requests in each runtime. Keep them small: imports, exports and the critical request flows.

- `smoke/esm` and `smoke/bun` install `faxios.tgz` from their own frozen lockfiles. `smoke/deno` can't install a tarball, so `deno task install` extracts it into `smoke/deno/.faxios`, which its [package.json](smoke/deno/package.json) depends on, and runs `deno install --frozen`; imports then resolve through the package's `exports` map, as in the other runtimes. When you add a scenario to one runtime, add it to the others where it applies.
- The `realFetch` suites in `smoke/deno` and `smoke/bun` use the runtime's own fetch against a local `Deno.serve`/`Bun.serve` (port 0, stopped in `finally`); the other suites inject `env.fetch`.
- [smoke/bun/tsconfig.json](smoke/bun/tsconfig.json) type-checks the Bun tests against the installed declarations (`pnpm lint:ts:smoke`, after the installs).
- [smoke/deno/types/consumer.ts](smoke/deno/types/consumer.ts) is checked by `deno check`, never run. It fails when a built module loses its `@ts-self-types` pragma.
- Don't delete or regenerate a harness lockfile. [AGENTS.md](../../AGENTS.md) ("Setup And Safety") explains how `run-tests.sh` pins the tarball.

Representative files: [smoke/esm/tests/fetch.smoke.test.ts](smoke/esm/tests/fetch.smoke.test.ts), [smoke/deno/tests/fetch.smoke.test.ts](smoke/deno/tests/fetch.smoke.test.ts), [smoke/bun/tests/fetch.smoke.test.ts](smoke/bun/tests/fetch.smoke.test.ts).

## Module (`module/esm/`)

Run this suite when you change declarations or `exports`. Its tests copy a fixture from [module/esm/tests/helpers/](module/esm/tests/helpers/) into a temp project and compile it with the suite's pinned TypeScript, so the published `.d.ts` files are checked as a consumer sees them.

Representative files: [module/esm/tests/typings.module.test.ts](module/esm/tests/typings.module.test.ts), [module/esm/tests/ts.module.test.ts](module/esm/tests/ts.module.test.ts).

## Docs examples (`docs-examples/`)

[docs-examples/extract.ts](docs-examples/extract.ts) extracts the `js`/`ts` code blocks from the root and package READMEs, `MIGRATION_GUIDE.md`, the package's agent skills and the docs pages. The comment at the top of that file lists the fence markers: `check=skip` with the `reason=` it is skipped, `check=types`, `status=` and `placeholders=` for the fake `fetch`, `expect=` for the documented outcome, and `contract=` for a declaration listing: [docs-examples/contract.ts](docs-examples/contract.ts) turns it into checks that fail `tsc` once a documented signature differs from the shipped declaration.

Each block runs as a module against a fake `fetch`. The test waits until every request the block started, and the code handling its response, has finished, then checks the block's `expect=` outcomes. A `console.error` call fails the block unless it has an `expect=error:` marker.

[docs-examples/contract.test.ts](docs-examples/contract.test.ts) checks that the API reference lists every root export and that the Request config page has a section for, and sets in its full example, every request config key; it also proves a changed contract block fails. [docs-examples/docs-build.test.ts](docs-examples/docs-build.test.ts) builds [fixtures/broken-vitepress/](docs-examples/fixtures/broken-vitepress/) and expects the VitePress build that `pnpm docs:build` runs to fail on its dead link.

## Checklist

- The file is in the right suite directory and matches its name pattern.
- Setup and teardown leave no server, global or spy behind.
- Shared setup uses [setup/](setup/) helpers instead of a copy.
- Assertions are deterministic and avoid timing and network flakiness.
