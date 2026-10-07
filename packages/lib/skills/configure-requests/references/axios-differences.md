# Axios differences

Read this before porting Axios code to faxios or reviewing a port. faxios keeps Axios's call shape
(`faxios.get(url, config)`, `response.data`, `create()`, `defaults`), but treat every Axios
behaviour outside this list as unverified until the installed types and a test prove it.

## Mapping

| Axios code | faxios replacement | Notes |
| --- | --- | --- |
| `import axios from "axios"` | `import faxios from "@gcmdev/faxios"` | ESM only; use `await import()` from CommonJS |
| `axios.interceptors.request.use(fn)` | `api.use(async (ctx, next) => { ...; return next(ctx); })` | Registration order, not reverse |
| `axios.interceptors.response.use(ok, fail)` | `try { const res = await next(ctx); ...; return res } catch (e) { ... }` inside `.use()` | Non-2xx arrives as a rejection. Middleware must return a response, so an interceptor that unwraps to `response.data` can't be ported; take `data` at the call site |
| `interceptors.request.eject(id)` | `api.eject(sameFunctionOrPlugin)` | By identity, not numeric id |
| `interceptors.request.clear()` | `eject()` each middleware, or a fresh `create()` | No `clear()` |
| interceptor `synchronous` / `runWhen` options | `if` inside the middleware for `runWhen` | `synchronous` has no equivalent |
| `transitional.legacyInterceptorReqResOrdering` | remove it | Throws `ERR_BAD_OPTION` ("Unknown option"), like any unknown `transitional` key |
| `CancelToken.source()` / `cancelToken` | `AbortController` + `signal` | `isCancel(e)` or `e.code === "ERR_CANCELED"` |
| `axios.isAxiosError(e)` | `isFaxiosError(e)` (named import) | Type guard |
| `error.code === "ECONNABORTED"` (timeout) | `error.code === "ETIMEDOUT"` | `clarifyTimeoutError` is inert |
| `error.code === "ECONNREFUSED"` | `error.code === "ERR_NETWORK"`, details on `error.cause` | All transport failures |
| `adapter: ...` / custom adapter | `env: { fetch }` or `fetchOptions` | No adapter option exists |
| `proxy: {...}` / `httpAgent` / `httpsAgent` | Runtime-level proxy config. In Node the project docs pass an `undici` `ProxyAgent` as `fetchOptions.dispatcher`, using the app's own `undici` dependency | Not faxios options; faxios passes the dispatcher to `fetch` but does not test proxying |
| `maxRedirects`, `beforeRedirect` | fetch follows redirects; `fetchOptions: { redirect: "manual" }` to stop | `ERR_FR_TOO_MANY_REDIRECTS` is never raised |
| `maxRate`, `socketPath`, `decompress`, `insecureHTTPParser`, `httpVersion`, HTTP/2 options, `lookup`, `family` | none | Removed; ignored at runtime when untyped |
| `onUploadProgress` | same option | Fires only where fetch streams request bodies (Node); not a browser guarantee |
| `responseType: "document"` | none in practice | Falls back to text |
| retry via `axios-retry` | `retry()` from `@gcmdev/faxios/plugins/retry` | POST/PATCH excluded by default |
| auth header interceptor | `authBearer()` from `@gcmdev/faxios/plugins/auth-bearer` | Sends only to the baseURL origin by default |

## Behaviour that changes silently

These ports compile and run but behave differently:

1. **Absolute URL on a `baseURL` instance.** Axios sends an absolute request URL as-is. faxios
   appends it to the instance `baseURL` unless `allowAbsoluteUrls: true` is set on the instance or
   request. Search ports for instance calls with `http://` or `https://` URLs.
2. **Untyped configs with removed keys.** A config built with spread or `any` keeps `proxy`,
   `adapter` or `httpAgent` and faxios ignores them. The request then goes direct, without the
   proxy or agent the code expected. Delete the keys and move the behaviour to `fetchOptions`.
3. **Interceptor order.** Axios ran request interceptors last-registered-first and response
   interceptors first-registered-first. Middleware runs in registration order on the way in and
   in reverse on the way out, so both sides flip; reorder the `.use()` calls.
4. **Timeout handling.** Branches that check `ECONNABORTED` never run.
5. **Statics on instances.** `instance.isCancel`, `instance.mergeConfig` and similar are undefined
   on `create()` instances.

## Port checklist

- [ ] No `axios` import remains, and no `interceptors`, `CancelToken`, `adapter`, `proxy`,
      `httpAgent`, `httpsAgent` or `ECONNABORTED` reference.
- [ ] Every instance with `baseURL` is checked for absolute-URL calls.
- [ ] Error handling branches on faxios codes: `ERR_BAD_REQUEST`, `ERR_BAD_RESPONSE`,
      `ERR_NETWORK`, `ETIMEDOUT`, `ERR_CANCELED`, and the `ERR_BAD_*_SCHEMA` codes if schemas are
      used.
- [ ] The project type-checks without casts on faxios configs.
- [ ] One success and one failure path run against the ported client.

`MIGRATION_GUIDE.md` section "h) Interceptors replaced by `.use()` middleware" and the docs pages
`advanced/middleware.md` and `advanced/migrating-from-interceptors.md` show interceptor-to-middleware
conversions; any `interceptors` code there is the "before" side. The guide's Fetch-Only section
still says Node 18+ and that custom adapters work through `adapter`. Both are wrong: faxios needs
Node 24+ and has no `adapter` option.

Sources: `MIGRATION_GUIDE.md` (Fetch-Only Migration), `src/lib/types.ts`, `src/lib/core/Faxios.ts`,
`src/lib/core/buildFullPath.ts`, `src/lib/helpers/composeSignals.ts`,
`src/lib/adapters/fetch-helpers.ts`, `packages/tests/unit/api.test.ts`.
