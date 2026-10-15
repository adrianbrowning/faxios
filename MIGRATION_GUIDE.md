# Migrating from axios to faxios

faxios started as a fork of axios and keeps most of its request API, but it uses the web-standard `fetch` API as its **only** HTTP transport in every runtime (browser, Node 24+, Deno, Bun). The axios adapters and their HTTP-stack dependencies are gone. This guide lists what behaves differently from axios and what to change in your code.

Install the package as `@gcmdev/faxios` and import its default export:

```javascript
import faxios from '@gcmdev/faxios';
```

## What changed at a glance

| Area | axios | faxios |
|------|--------|-----|
| Node transport | `http`/`https` adapter (`follow-redirects`, `form-data`, `proxy-from-env`, `https-proxy-agent`) | web-standard `fetch` |
| Browser transport | `XMLHttpRequest` (xhr) adapter | web-standard `fetch` |
| Package format | (see ESM-only note below) | ESM-only, no CJS / no UMD |
| Upload progress | `onUploadProgress` | supported in Node.js; not called in browsers, Deno or Bun |
| Download progress | `onDownloadProgress` | still supported |
| Connection-refused error code | `ECONNREFUSED` | `ERR_NETWORK` (OS error on `error.cause`) |

## a) Node `http`/`https` adapter removed

All requests in all runtimes go through `fetch`. There is no `http`/`https` adapter and no `transport` selection. faxios needs Node 24 or later (`engines.node` is `>=24.0.0`).

## b) Browser XHR adapter removed

The `XMLHttpRequest` adapter is gone. Browsers use `fetch`. There is no `adapter` option: passing one rejects with `ERR_BAD_OPTION`. To replace the transport, pass a custom `fetch` as `env.fetch`.

## c) ESM-only — no CJS build, no UMD/CDN bundle

faxios ships as ESM only, built by `zshy`. Use `import faxios from '@gcmdev/faxios'`. From CommonJS, load it with `await import('@gcmdev/faxios')`. Node's `require(esm)` support may load it too, but that isn't a supported entry: there is no CJS build or `require` export condition, no `.d.cts`, and no UMD / minified CDN `<script>` bundle.

## d) `onUploadProgress` works only in Node.js

faxios reports upload progress by streaming the request body, which only Node.js's `fetch` supports today. In browsers, Deno and Bun `onUploadProgress` is not called and the body is sent as it is. `onDownloadProgress` works in every runtime. See [Fetch adapter](https://adrianbrowning.github.io/faxios/pages/advanced/fetch-adapter).

```javascript check=skip reason=fragment
faxios.post('/upload', body, {
  onUploadProgress: e => console.log(e.loaded),   // Node.js only
  onDownloadProgress: e => console.log(e.loaded), // every runtime
});
```

## e) Removed config fields

The following config fields were removed from the public type. Passing them is a **type error**, and at runtime the request **rejects** with a `FaxiosError` whose `code` is `ERR_BAD_OPTION`; the message names the field and what to use instead:

`adapter`, `cancelToken`, `maxRedirects`, `maxRate`, `beforeRedirect`, `socketPath`, `allowedSocketPaths`, `transport`, `httpAgent`, `httpsAgent`, `proxy`, `decompress`, `insecureHTTPParser`, `httpVersion`, `http2Options`, `sensitiveHeaders`, `lookup`, `family`, `responseEncoding`, `formDataHeaderPolicy`.

Any other unknown request config key rejects the same way, so a typo such as `timout` fails instead of silently dropping the timeout. Keys a plugin adds, such as `retry`, are accepted while the plugin is installed. `responseType: "document"` and `responseType: "response"` reject with `ERR_BAD_OPTION_VALUE`, and `transitional.advertiseZstdAcceptEncoding` rejects with `ERR_BAD_OPTION`; none of them ever changed what faxios did. Text is always decoded as UTF-8: read other encodings with `responseType: "arraybuffer"` and a `TextDecoder`.

`maxContentLength` and `maxBodyLength` are **kept** and enforced by the fetch adapter. Both default to `-1` (no limit); set them to cap response and request body size in bytes.

**JSON parsing.** As in axios, a string response body is parsed as JSON when `responseType` is unset (`transitional.forcedJSONParsing`), and left as text if it is not valid JSON. With `responseType: "json"` a 2xx body that is not JSON rejects with `ERR_BAD_RESPONSE`; a 4xx or 5xx body that is not JSON keeps its status error, with the parse error on `error.cause`.

**Config merge.** Request headers now beat instance headers in every group: the order, lowest first, is instance `common`, instance method group, instance top-level, request `common`, request method group, request top-level. Previously an instance top-level header beat a request's `common` or method group. A request option set to `undefined` now counts as unset on `request()` and every method alias, so `{ timeout: undefined }` or `{ baseURL: undefined }` keeps the instance value; only `xsrfCookieName` and `xsrfHeaderName` are still cleared by `undefined`. `transitional.validateStatusUndefinedResolves` now defaults to `false`, so `validateStatus: undefined` rejects non-2xx like the default validator; pass `validateStatus: null` to resolve every status.

## f) Connection / transport errors now surface as `ERR_NETWORK`

A refused connection or other transport failure now rejects with `FaxiosError` code `ERR_NETWORK`, and the underlying OS error (e.g. `ECONNREFUSED`) is attached on `error.cause`. Previously the http adapter surfaced `ECONNREFUSED` as the error code itself.

```javascript check=skip reason=fragment
// Before
catch (err) {
  if (err.code === 'ECONNREFUSED') { /* ... */ }
}

// Now
catch (err) {
  if (err.code === 'ERR_NETWORK') {
    const os = err.cause;            // e.g. Error with code 'ECONNREFUSED'
  }
}
```

## g) HTTP/2 and rate limiting removed

`http2Options` (HTTP/2) and `maxRate` (download/upload throttling) are gone. The `fetch` runtime negotiates the HTTP version; throttle at the application or runtime layer if needed.

## Proxy support

faxios no longer manages proxies (`proxy`, `proxy-from-env`, `https-proxy-agent` were removed). Configure proxying at the `fetch` runtime level instead:

- **Node (undici):** set a custom dispatcher/agent via `fetchOptions` (e.g. an undici `ProxyAgent`), or rely on runtime-level proxy environment variables that your `fetch` implementation honors.
- **Browser / Deno / Bun:** use the platform's own proxy configuration.

```javascript check=skip reason=dependency
// Node example: proxy via an undici dispatcher passed through fetchOptions
import { ProxyAgent } from 'undici';

faxios.get('https://api.example.com', {
  fetchOptions: { dispatcher: new ProxyAgent('http://proxy.local:8080') },
});
```

## h) Interceptors replaced by `.use()` middleware

`faxios.interceptors` is gone. Register middleware with `.use()`: code before `await next(ctx)` changes the request through `ctx.config`, code after it sees the response, and a `try`/`catch` around `next` replaces an `onRejected` handler. Request interceptors ran last-registered-first while middleware runs in registration order, so check the order when you convert several. `use()` returns the instance, typed with any plugin's request options: keep and use the chained result. Instances made with `create()` start with no middleware. Passing `transitional.legacyInterceptorReqResOrdering` now rejects with `ERR_BAD_OPTION`.

```javascript check=skip reason=fragment
// Before
faxios.interceptors.request.use(config => {
  config.headers.set('Authorization', `Bearer ${getToken()}`);
  return config;
});

// Now
const api = faxios.create().use(async (ctx, next) => {
  ctx.config.headers.set('Authorization', `Bearer ${getToken()}`);
  return next(ctx);
});
```

See [Middleware](https://adrianbrowning.github.io/faxios/pages/advanced/middleware) and [Migrating from interceptors](https://adrianbrowning.github.io/faxios/pages/advanced/migrating-from-interceptors) for response interceptors, error handlers, `runWhen`, `eject` and ordering. The patterns below use middleware.

## i) Request `headers` are strictly typed

Request-config `headers` takes strings, numbers, booleans, `null` and `undefined`. Objects and functions are type errors, so convert other values first: `{ "X-Request-Id": String(id) }`. See [Headers](https://adrianbrowning.github.io/faxios/pages/advanced/headers#header-typing).

## j) Absolute URLs on a `baseURL` instance reject

An instance with a `baseURL` defaults `allowAbsoluteUrls` to `false`. An absolute request `url` on it used to be appended to the base (`https://api.example.com/v1/https://other.example/x`); it now rejects with `ERR_INVALID_URL` before fetch is called, and `getUri()` throws the same error. Set `allowAbsoluteUrls: true` on the instance or the request when the absolute URL is trusted (for example `next`/`Link` URLs from your API), or use an instance without `baseURL`. See [`allowAbsoluteUrls`](https://adrianbrowning.github.io/faxios/pages/advanced/request-config#allowabsoluteurls). `getUri()` with neither `url` nor `baseURL` also throws `ERR_INVALID_URL`, where axios returns `undefined`.

## k) Request body Content-Type and FormData field names

- **String bodies:** faxios no longer sets `application/x-www-form-urlencoded` on a plain string `post`, `put` or `patch` body. `fetch` sends it as `text/plain;charset=UTF-8`. If your server expects a urlencoded string, set the header, or pass a `URLSearchParams`, which faxios sends as `application/x-www-form-urlencoded;charset=utf-8`.
- **`form-data` package bodies:** an instance of the npm `form-data` package (an object with `getHeaders()`) now rejects with `FaxiosError` code `ERR_NOT_SUPPORT` before anything is sent. It used to be sent as the text `[object FormData]`. Use the runtime's global `FormData`.
- **`formDataHeaderPolicy` removed:** it only applied to `getHeaders()` bodies. Passing it now rejects with `ERR_BAD_OPTION` (see e) above); drop it from your config.
- **FormData Content-Type:** faxios now removes any `Content-Type` you set for a `FormData` body in every runtime, including one with your own `boundary`, so the header always carries the boundary the body was encoded with. Before, Node kept a `boundary` you set even though the body used another one.
- **`formToJSON` field names:** names split into nested keys only on `.` and brackets. `first-name` now gives `{ "first-name": … }` instead of `{ first: { name: … } }`, and `last name` stays one key. Rename fields to `first.name` or `first[name]` to keep the nesting.

```javascript check=skip reason=fragment
// Before: sent as application/x-www-form-urlencoded
await faxios.post('/login', 'user=ada&pass=secret');

// Now
await faxios.post('/login', new URLSearchParams({ user: 'ada', pass: 'secret' }));
// or keep the string and set the header
await faxios.post('/login', 'user=ada&pass=secret', {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});
```

## l) `timeout` covers the whole request

`timeout` used to bound one `fetch` call: middleware, async schemas and every retry try ran outside it, so `timeout: 5000` with the `retry` plugin could take minutes, and a hung middleware never timed out. It now starts before middleware and bounds the whole request, retries included, and a timed-out request is not retried. For a limit per try, use the `retry` plugin's `attemptTimeout`. Changing `ctx.config.timeout` in middleware no longer has any effect.

```javascript
import faxios from '@gcmdev/faxios';
import { retry } from '@gcmdev/faxios/plugins/retry';

// Before, `timeout: 5000` meant up to 3 tries of 5 seconds each, plus the waits between them.
// Now: 5 seconds per try, 20 seconds in all.
const api = faxios.create({ timeout: 20_000 }).use(retry({ attempts: 3, attemptTimeout: 5000 }));
```

## m) `response.headers` and request headers are typed `FaxiosHeaders`

`response.headers`, `ctx.config.headers` in middleware and the `headers` argument of `transformRequest` and `transformResponse` are typed as the `FaxiosHeaders` class, which is what they are at runtime. `has()`, `getSetCookie()`, the shortcuts and `for...of` work without a cast. The `FaxiosResponseHeadersLike` and `FaxiosRequestHeaders` types are removed: import `FaxiosHeaders` instead.

The `get<Header>` shortcuts take the parsers `get()` takes (`true`, a `RegExp` or a function), so `getContentType(/charset=(\S+)/)` is typed `RegExpExecArray | null | undefined`. Passing a string, such as `getContentType("application/json")`, is now a type error; it always threw `TypeError` at runtime. Use `hasContentType("application/json")` to test a value.

## n) A response generic must match `responseSchema`

`faxios.get<T>(url, { responseSchema })` (and every other method) now requires the schema's output to match `T`. Before, the explicit generic silently replaced the schema's output type, so `get<{ nope: string }>("/u", { responseSchema: zUser })` compiled and `response.data.nope` was typed `string`. Drop the generic and let the schema type `response.data`, or make the generic match. A config typed `FaxiosRequestConfig` whose `responseSchema` is a plain `StandardSchemaV1` no longer fits a generic call; type the schema with its output (`StandardSchemaV1<unknown, User>`).

`define()` and `route()` endpoints without a schema now accept `pathParams`, `params` and `data` per call, `env.Response` accepts the global `Response`, and `define()`/`route()` infer `response.data` from a schema with no `~standard.types` field. These only remove type errors.

## o) TypeScript 5.4 or greater

The type declarations use `NoInfer`, which TypeScript 5.4 added, so faxios needs TypeScript 5.4 or greater. The docs used to say 4.7; on 4.7 to 5.3 the compiler reports `Cannot find name 'NoInfer'` in faxios's own `.d.ts` files. Upgrade TypeScript to 5.4 or later.

## p) A request that sends the XSRF header refuses redirects

In a browser, when faxios sets the XSRF header (default cookie `XSRF-TOKEN`, as in axios) and the request has no own `fetchOptions.redirect` (or an own `undefined`), it sends the request with `redirect: "error"`. Fetch strips only `Authorization` when a redirect leaves the origin, so following one would send the token to whatever host it points at. Axios follows the redirect. A redirect now rejects with `ERR_NETWORK`, same-origin ones included; set `fetchOptions: { redirect: "follow" }` (or `"manual"`) on the request to choose for yourself.

## q) `error.config.data` is the caller's value

In axios, `error.config.data` is the serialized body, such as the JSON string. In faxios it is the value the request was given (after `requestSchema`, when one is set): an object stays an object. Code that runs `JSON.parse(error.config.data)` should read the value directly.

## r) `responseType` is case-insensitive

`responseType: "JSON"`, or any other case, parses the body like `"json"`, strict-JSON errors included.

## s) Response types take `<T, D>`, with no `R` parameter

Axios methods take `<T, R = AxiosResponse<T>, D>`. faxios methods take `<T, D>` and always resolve to `FaxiosResponse<T, D>`, so `faxios.get<User, FaxiosResponse<User>>(url)` compiles with the second argument read as the request body type `D`. Drop the `R` argument when porting: `get<User>(url)`, or `post<User, NewUser>(url, body)`.

## Upgrading from faxios 0.2

The release after 0.2.x is a breaking one. The changelog has the full entry for each change; check your code for these:

- **Config is checked.** A config key that is neither a faxios option nor a request option of an installed plugin, an unknown `transitional`, `paramsSerializer` or `formSerializer` key, and the removed `transitional.silentJSONParsing`, `transitional.clarifyTimeoutError` and `formDataHeaderPolicy` reject with `ERR_BAD_OPTION`. A wrong-typed value, an explicit empty `method`, a `signal` without `addEventListener`/`removeEventListener`, a `maxContentLength`/`maxBodyLength` other than `-1` or a finite number from `0`, and a `retry` `attempts` above 10 reject with `ERR_BAD_OPTION_VALUE`.
- **Timeouts.** `timeout` bounds the whole request, retries included, and a timed-out request is not retried; use `retry({ attemptTimeout })` for a per-try limit. Timeouts reject with `ETIMEDOUT`.
- **URLs.** An absolute `url` on an instance with a `baseURL` rejects with `ERR_INVALID_URL` unless `allowAbsoluteUrls` is `true`. A `url` is absolute only when a scheme is followed by `//`. `getUri()` fills `{key}` placeholders from `pathParams` and throws `ERR_INVALID_URL` with neither `url` nor `baseURL`.
- **Redirects.** A request that sends the XSRF header, or whose `authBearer` plugin sets a custom `header`, defaults to `redirect: "error"`; set `fetchOptions.redirect` to choose.
- **Bodies and responses.** A plain string body is sent as `text/plain`, and a string with a JSON `Content-Type` is sent as written. Any `Content-Type` set for a `FormData` body is removed, and npm `form-data` bodies reject with `ERR_NOT_SUPPORT`. `responseType: "json"` (any case) rejects a body that isn't JSON with `ERR_BAD_RESPONSE`.
- **Headers.** Request headers beat instance headers in every group, and a `create()` child's headers beat its parent's. `response.headers` is a `FaxiosHeaders`.
- **Errors.** `name` stays `"FaxiosError"` on wrapped errors, network error messages name the reason and the request, `toJSON()` always masks credentials, and `error.config.data` is the body you passed. `TimingEvent.error` is `{ code, message, status }`.
- **Removed API.** The `Cancel` alias (use `CanceledError`), `FaxiosError.ECONNABORTED`, `ECONNREFUSED` and `ERR_FR_TOO_MANY_REDIRECTS` (check `ERR_NETWORK` and `error.cause`), `FaxiosHeaders.accessor()`, the `@gcmdev/faxios/unsafe/utils.js` subpath, and the `RawFaxiosRequestConfig`, `FaxiosResponseHeadersLike` and `FaxiosRequestHeaders` types.
- **Types.** TypeScript 5.4 or greater. Methods take `<T, D>` with no `R` parameter, a response generic must match `responseSchema`, and `toFormData` options are typed `FormSerializerOptions`.
- **`formToJSON`** splits field names only on `.` and brackets.

## Need help?

If something in this guide is wrong or missing, please [open an issue](https://github.com/adrianbrowning/faxios/issues).
