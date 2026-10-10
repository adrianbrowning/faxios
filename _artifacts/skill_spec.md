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
| configure-requests | core | requests | instances, call forms, config merging, URL resolution, schemas, cancellation, timeouts, error codes, `.use()` middleware, built-in plugins, transport via `env.fetch`/`fetchOptions`, stable vs `unsafe/*` imports, Axios porting | 10 |

## Failure Mode Inventory

### configure-requests (10 failure modes)

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
| 10 | Downloading a binary body without `responseType` | MEDIUM | `src/lib/adapters/fetch.ts` | — |

## Tensions

| Tension | Skills | Agent implication |
| --- | --- | --- |
| Axios-like call shape vs Axios-incompatible internals | configure-requests | Loose configs compile but silently drop proxies, adapters or interceptor behaviour |

## Subsystems & Reference Candidates

| Skill | Subsystems | Reference candidates |
| --- | --- | --- |
| configure-requests | — (one fetch transport) | `references/plugins.md` (built-in plugin installation, definePlugin type slots), `references/axios-differences.md` (porting table) |

## Remaining Gaps

| Skill | Question | Status |
| --- | --- | --- |
| configure-requests | Should `./unsafe/*` subpaths get a documented stability statement? | open |
| configure-requests | Is Node proxying through `fetchOptions.dispatcher` a supported, tested path? | open |
| configure-requests | `MIGRATION_GUIDE.md` Fetch-Only section still says Node 18+ and that custom adapters work through `adapter` | open |
| configure-requests | Intent resolves `@gcmdev/faxios/*` to `src/*` and ignores `exports`, so subpath imports can't be type-checked in SKILL.md | open (upstream) |

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
- **Built-in plugin example lives in `references/plugins.md`** (maintainer decision, 2026-10-06).
  Intent 0.5.3 type-checks SKILL.md code blocks but resolves `@gcmdev/faxios/*` to `src/*`, which
  doesn't match the published `exports`, so a block importing `@gcmdev/faxios/plugins/retry` can't
  pass `maintainer check`. SKILL.md names each subpath in prose and links the reference. The
  reference block type-checks in the `packages/tests` workspace (workspace build of `packages/lib`), but Intent does not check reference
  files. Move the example back into SKILL.md once Intent resolves subpath exports.

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
    - A throwaway runtime script run from `packages/tests` against the workspace build of `packages/lib` (`pnpm build`), with an injected `env.fetch`,
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
    - Every TypeScript block in the skill and references type-checks under strict `nodenext` in the `packages/tests` workspace. That workspace has `zod`, which one example imports, and resolves `@gcmdev/faxios` through its `exports` to the workspace build of `packages/lib`. The packed tarball was not type-checked this way. `@ts-expect-error` checks
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
    - Second fresh consumer, after the plugin example moved: the same fixture, repacked, with a
      task to build a client with a bearer token, retries and a never-retried `/health`. The
      agent loaded the skill, followed the link to `references/plugins.md` and passed all 5 checks
      of a runtime grader (3 attempts, token sent, `/health` called once, URL, data returned).
      - The grader passed a reference solution.
      - It failed a control that never installs `retry`.
      - One run only.
    - `intent validate` (0.5.3) first reported 5 errors in a SKILL.md block that imported the
      plugin subpaths. Intent maps `@gcmdev/faxios/*` to `packages/lib/src/*` and
      `packages/lib/*` and ignores the package's `exports` map, so `@gcmdev/faxios/plugins/retry`
      (really `src/lib/plugins/retry.ts`) does not resolve, and two errors followed from that.
      The block moved to `references/plugins.md` (see Decisions). `intent validate` and
      `maintainer check` now pass. All TS blocks in SKILL.md and `plugins.md` type-check in the
      `packages/tests` workspace against the workspace build of `packages/lib`.
- **Batch 1 follow-up (2026-10-07, after merging `main` at `f1274733`).**
  - `retry` gained `respectRetryAfter` (#141). SKILL.md's retry bullet now covers it.
  - #142 rewrote `MIGRATION_GUIDE.md` and the docs to convert interceptors to middleware.
    `references/axios-differences.md` now points to those pages instead of telling agents to
    ignore the guide.
  - The other 27 merged files (`git diff --name-status ff5f38c6 cf6f2410`, including four deleted
    interceptors pages) were each reviewed from their diff:
    - 16 consistent, 2 with no API claims, 8 with behaviour the skill lacked.
    - One, `advanced/middleware.md`, contradicts source. It uses `:id` placeholders, but only
      `{key}` is substituted. The skill is right, so no skill change. Fixed in #146.
  - Gaps that were added, each confirmed by a runtime script against the workspace build:
    - `new Faxios()` has no `use`/`eject`.
    - On `ERR_BAD_RESPONSE_SCHEMA`, `error.response.data` is the rejected body.
    - Middleware sees unvalidated params.
    - A custom `retryOn` replaces the default predicate (1 call on `ERR_NETWORK`).
    - A `Retry-After` longer than `maxRetryAfter` doesn't retry (1 call).
    - `transitional.legacyInterceptorReqResOrdering` throws `ERR_BAD_OPTION`.
  - Also added, from `migrating-from-interceptors.md` and the instance API, not run: no
    interceptor `clear()`, and no `synchronous` equivalent.
  - Gaps not added, as too minor for the skill:
    - an `onRetry` that throws stops retrying
    - `attempts` and `methods` validation
    - `eject` frees provided capabilities
    - the `auth` capability ignores the origin rule
    - `error.config` keeps the original input on input-schema errors
  - Skill additions, and how each was checked:
    - Flat header keys win over group keys. Runtime script: `X-K` sent as `flat`. Allowed header
      value types: from `types.ts` (`FaxiosHeaderValue`), not run.
    - `ctx.config.method` is lower-case in middleware. Runtime script: `post`.
    - `authBearer` with a relative or missing `baseURL` sends the token only to relative URLs.
      Runtime script: relative `Bearer t`, absolute none.
    - Installing `retry` before `authBearer` calls `getToken` on each attempt. Runtime script:
      3 calls (`t1`–`t3`) vs 1 call in the other order.
    - `TimingEvent` has `attempt?`: from `timing.ts`, not run with `retry`. `url` has no query
      and keeps `{param}`. Runtime script: `https://a.example/v1/u/{id}`.
    - Porting: response interceptor order flips too, and data-unwrapping interceptors can't be
      ported. From `migrating-from-interceptors.md` and middleware's return type, not run.
  - Doc bugs found, not skill changes:
    - `advanced/middleware.md` uses `/users/:id` with `pathParams`, but only `{key}` is
      substituted (fixed in #146: the page uses `{id}`, and `test:docs-examples` now rejects
      unsubstituted placeholders)
    - `PRE_RELEASE_CHANGELOG.md` says the type guards are "on the instance"
    - `packages/examples/network_enhanced.js` checks `ECONNREFUSED`
  - CI's first `check-skills` run failed with `TS18046: 'data' is of type 'unknown'` on the zod
    schema example. Intent resolves example imports from the repository root, and the root had
    no `zod`. Locally the example passed only because `zod` was installed in `~/node_modules`.
    Reproduced in a clean checkout under `/tmp`. Fixed by adding `zod` (4.6.5, the
    `packages/tests` version) as a root devDependency, ignored by knip.
  - Earlier local `intent validate` results (Batch 1) ran with that home-directory `zod`.
    Now checked from a clean checkout outside `~`.
- **Batch 2 (2026-10-08, source `1f5cc0c0`, #148).**
  - `define()`/`route()` were not assessed beyond a pointer. They return plain functions with no
    `.use()`, and agents chained `.define(...).use(retry())`.
  - SKILL.md now states the wiring rule (call `define()`/`route()` on the value `.use()` returned)
    with a root-only example (inline middleware, `pathParamsSchema`, call), checked by
    `intent validate`. The `retry()` variant is in `references/plugins.md`, since SKILL.md can't
    import plugin subpaths.
  - Middleware is read per call (`define.ts` calls `instance.request()`), so registration order is
    a typing rule, not a runtime one. Pinned by a `define.test.ts` unit test.
  - Added `src/lib/core/define.ts` and `src/lib/core/route.ts` to `sources`.
- **Batch 3 (2026-10-08, source `1f5cc0c0`, #149): binary downloads.**
  - Added a `responseType: "arraybuffer"` download pattern under "Choose the right call form" and
    common mistake #10 (binary body without `responseType`).
  - Checks: a throwaway runtime script against the workspace build of `packages/lib`
    (`pnpm build`, Node 26.8.1), with an injected `env.fetch`:
    - `arraybuffer` (and `ArrayBuffer`) gives an `ArrayBuffer`, `blob` a `Blob`, `formdata` a
      `FormData`, `stream` a `ReadableStream`.
    - `text` returns the JSON string unparsed; `json` parses it; `document` returns text.
    - Unset parses a JSON body and returns a binary body as a corrupted string.
    - `response` returns text, not a stream, so it is left out of the docs list.
