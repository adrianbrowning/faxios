# Coding Standards

Rules for writing and reviewing library code in `packages/lib/src`. Mechanical rules live in the linters and checks (`pnpm check`); these are the judgement calls a reviewer applies to a diff.

## Caller input is untrusted

Config objects, plugin objects, option objects and anything else a caller hands faxios may come from a polluted `Object.prototype` (THREATMODEL T-R4b).

- Read caller-supplied fields as own properties: `hasOwnProp(obj, key)` from `utils.ts` or a local `own()` helper. Never use `in`, destructuring, plain `obj.foo` or `Object.assign` on them. This covers request config (`ctx.config.retry`, `.signal`, `.method`, `.data`), plugin objects (`name`, `middleware`, `provides`) and plugin option objects.
- Merging or materializing objects filters `__proto__`, `constructor` and `prototype`, and builds null-prototype results (`helpers/cloneConfig.ts`, `ctx.state`, `ctx.capabilities`). Regressions here are security bugs.
- URL construction (CRLF/header injection), XSRF and the `maxContentLength` / `maxBodyLength` guards in `lib/adapters/fetch.ts`: consult `THREATMODEL.md` and add focused regression tests. Only `withXSRFToken === true` forces cross-origin XSRF header attachment.

## Options and errors

- Validate options through `helpers/validator.ts` (`assertOptions` with a schema), for the factory argument and any per-request override alike; built-in plugins use `assertOptions` from `plugins/shared.ts`. Reject `null`, non-objects and unknown keys; check numbers for range and finiteness, since `NaN` or `Infinity` can make a loop unbounded.
- Throw `FaxiosError(message, code, config, request, response)` for faxios-originated failures, never raw `Error`. Wrap third-party errors with `FaxiosError.from(...)`. Codes live in `core/FaxiosError.ts`; bad option values are `ERR_BAD_OPTION_VALUE`, unknown options `ERR_BAD_OPTION`.
- A patch change keeps every input the code accepted before. Narrowing what an option takes (an allow-list of keys, rejecting a value that used to work, a stricter type) changes behaviour for some caller, so it goes in the next minor with a bump file that says so.

## Cancellation and listeners

- `AbortSignal` via `config.signal` is the only cancellation mechanism, and it works at every lifecycle stage, including while middleware awaits and mid-flight body reads.
- Remove every signal listener on every path that settles: resolve, reject, abort, timeout and synchronous throw. Add the listener before starting the work it guards, so an abort that happens immediately is still seen.
- Check the signal before running work that has side effects, so an already-aborted request does nothing.

## Middleware and plugins

- Middleware composition stays plain closures with no async wrapper; a middleware that calls `next` before awaiting reaches the adapter in the same tick.
- Each `next(ctx)` dispatches its own copy of `ctx.config`; dispatch never writes back to `ctx.config`.
- `use()` / `eject()` replace the middleware list and capabilities instead of mutating them; in-flight requests keep their snapshot.
- Built-in plugins use only the public middleware API: they import only the package root (`../../index.js`) and each other, which `lint:esl` enforces, and they share per-request values through public context fields such as `ctx.attempt`, never a private symbol. Defaults are conservative: `retry` retries idempotent methods only.

## Shape and style

- Don't mutate config objects in place; return new objects from merges and transforms.
- Capability-check browser- or Node-specific globals before use.
- Classes PascalCase, functions camelCase, error codes UPPER_SNAKE_CASE on `FaxiosError`.
- Private state in TypeScript classes uses `#` fields; plain `.js` files use `Symbol`-keyed slots. No underscore-prefixed names.
- Use native `Function.prototype.bind`.
- Keep `lib/helpers/` generic; faxios-specific lifecycle logic belongs in `lib/core/`.

## Tests

- A regression test fails before the fix and passes after it, for the reason the fix addresses.
- Assert what a caller can observe: the request on the wire, the result, the error and its `code`, listeners left on a signal. Counting calls into internal code, or patching a built-in method to watch it, tests how the code is written, so it fails on a correct refactor.
- Use `vi.useFakeTimers()` or promise gates, never real timers. Restore globals, `Object.prototype` pollution and spies in `finally` or cleanup hooks.
- Install middleware on a fresh `faxios.create()` instance. If a test must use the shared default instance, eject the middleware in `finally`.
- Type tests put negative cases in uncalled functions. Each `@ts-expect-error` names the code it expects (`// @ts-expect-error TS2353 -- reason`), which `lint:ts` checks.
