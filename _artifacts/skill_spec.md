# faxios skill spec

faxios (`@gcmdev/faxios`, published from `packages/lib`) is a promise-based HTTP client with an
Axios-like call shape and a single transport: the runtime's `fetch`. It runs in browsers, Node 24+,
Deno and Bun and ships as ESM only. The skills exist so agents use the surface faxios implements
and stop generating Axios APIs it removed or never verified.

## Domains

| Domain | Description | Skills |
| --- | --- | --- |
| requests | Building instances and requests, handling results and failures, extending the lifecycle with middleware | configure-requests |

## Skill Inventory

| Skill | Type | Domain | What it covers | Failure modes |
| --- | --- | --- | --- | --- |
| configure-requests | core | requests | instances, call forms, config merging, URL resolution, schemas, cancellation, timeouts, error codes, `.use()` middleware, built-in plugins, transport via `env.fetch`/`fetchOptions`, stable vs `unsafe/*` imports, Axios porting | 9 |

## Failure Mode Inventory

### configure-requests (9 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | --- | --- | --- | --- |
| 1 | Using Axios interceptors | HIGH | `packages/tests/unit/api.test.ts` | — |
| 2 | Passing Axios transport options (`adapter`, `proxy`, `httpAgent`, ...) | HIGH | `src/lib/types.ts`, `MIGRATION_GUIDE.md` | — |
| 3 | Using `CancelToken` | HIGH | `src/lib/cancel/` | — |
| 4 | Checking `ECONNABORTED` for timeouts | HIGH | `src/lib/helpers/composeSignals.ts` | — |
| 5 | Absolute URL on a `baseURL` instance | HIGH | `src/lib/core/Faxios.ts`, `src/lib/core/buildFullPath.ts` | — |
| 6 | Importing plugins from the package root | MEDIUM | `packages/lib/package.json` | — |
| 7 | Calling statics on `create()` instances | MEDIUM | `src/lib/faxios.ts` | — |
| 8 | Promising upload progress in browsers | MEDIUM | `packages/docs/pages/advanced/fetch-adapter.md` | — |
| 9 | Assuming POST is retried | MEDIUM | `src/lib/plugins/retry.ts` | — |

## Tensions

| Tension | Skills | Agent implication |
| --- | --- | --- |
| Axios-like call shape vs Axios-incompatible internals | configure-requests | Loose configs compile but silently drop proxies, adapters or interceptor behaviour |

## Subsystems & Reference Candidates

| Skill | Subsystems | Reference candidates |
| --- | --- | --- |
| configure-requests | — (one fetch transport) | `references/plugins.md` (definePlugin type slots), `references/axios-differences.md` (porting table) |

## Remaining Gaps

| Skill | Question | Status |
| --- | --- | --- |
| configure-requests | Should `./unsafe/*` subpaths get a documented stability statement? | open |
| configure-requests | Is Node proxying through `fetchOptions.dispatcher` a supported, tested path? | open |
| configure-requests | `MIGRATION_GUIDE.md` and several docs pages still show interceptors, Node 18 and custom adapters | open |

## Recommended Skill File Structure

- **Core skills:** configure-requests
- **Framework skills:** none; faxios is framework-agnostic
- **Lifecycle skills:** none yet; Axios porting lives in a `configure-requests` reference
- **Composition skills:** none yet
- **Reference files:** configure-requests: `plugins.md`, `axios-differences.md`

## Decisions

- **Distribution: package-only.** Skills ship in the `@gcmdev/faxios` tarball and version with it.
  Recorded with `intent maintainer setup --distribution none` (maintainer decision, 2026-10-06).
  No repository or plugin installers.
- **Planning records live at the repository root (`_artifacts/`).** That is Intent's monorepo
  location, and it keeps them out of the published package. The skill itself is owned by
  `packages/lib`.
- **One skill for the first batch.** Configuration, cancellation, errors, middleware and porting
  are one developer task ("send requests with faxios correctly"). Conditional detail lives in
  references, not separate skills.
- **Source over docs.** Where `MIGRATION_GUIDE.md` or docs pages contradict source and tests
  (interceptors, Node 18, custom adapters, `onUploadProgress` removed), the skill follows source and
  tests.
- **`unsafe/*` is out of scope for application code.** The skill lists those exports but tells
  agents not to use them.

## Coverage and batch history

- **Batch 1 (2026-10-06, source `01316e10`, `@gcmdev/faxios` 0.1.0, Intent 0.5.3).**
  - Registered `configure-requests` in `packages/lib` (domain `requests`). Developer tasks:
    - Create a configured faxios instance with baseURL, headers and timeout.
    - Cancel a request or apply a timeout and tell the failure codes apart.
    - Add auth, retry or timing behaviour with `.use()` middleware and the built-in plugins.
    - Port Axios-style code without assuming unverified Axios compatibility.
  - Assessed scope: the public exports in `src/index.ts` and `package.json` `exports`, the request
    lifecycle in `core/`, the fetch adapter and the three built-in plugins.
  - Not assessed: `toFormData`/`formToJSON` serialization details, `paramsSerializer` options,
    progress events, `define()`/`route()` typed endpoints beyond a pointer, and `transitional`
    flags.
  - Checks:
    - A throwaway runtime script against the built package with an injected `env.fetch`
      confirmed every behavioural claim, including:
      - absolute URL appended to `baseURL`
      - `ETIMEDOUT`, `ERR_NETWORK` with `cause`, `ERR_BAD_REQUEST`/`ERR_BAD_RESPONSE`
      - `ERR_CANCELED`
      - `ERR_BAD_RESPONSE_SCHEMA`
      - middleware not inherited by `create()`
      - `undefined`/`null` header semantics
      - retry skips POST
      - authBearer origin rule
      - `eject`
      - class-instance `fetchOptions` passthrough
    - Every TypeScript block in the skill and references type-checks, and `@ts-expect-error` checks
      confirm that `adapter`, `proxy`, `httpAgent`, `cancelToken`, `interceptors`, instance statics,
      root plugin imports and plugin options without the plugin are type errors.
    - Fresh consumer: a disposable project ran `npm i` on the packed tarball and
      `@tanstack/intent@0.5.3` (a local copy; `npx intent` resolved to it), set
      `intent.skills: ["@gcmdev/faxios"]` and ran `intent install`. An isolated agent with no
      authoring context was asked to port an Axios client (interceptor, absolute URL on a
      `baseURL` instance, `CancelToken`, `ECONNABORTED`/`ECONNREFUSED`). It ran `intent list`
      and `intent load @gcmdev/faxios#configure-requests`, and its port passed all 8 checks of a
      runtime grader with an injected `fetch`.
      - The grader passed a hand-written reference port.
      - It failed a plausible wrong port (no `allowAbsoluteUrls`, Axios error codes) on 3 checks.
      - One run only. No reliability claim, and no run without the skill to compare against.
    - Discovery: the consumer loaded the skill from `intent list` without being told its name.
      Adjacent should-not-load prompts were not run.
    - `intent validate` (0.5.3) reports 5 errors in the plugin-subpath block. Intent maps
      `@gcmdev/faxios/*` to `packages/lib/src/*` and `packages/lib/*` and ignores the
      package's `exports` map, so `@gcmdev/faxios/plugins/retry` (really
      `src/lib/plugins/retry.ts`) does not resolve. Two of the errors follow from that. The
      imports are correct for consumers (the same block type-checks against the built package).
      `maintainer check` stays red until Intent resolves subpath exports. Open.
