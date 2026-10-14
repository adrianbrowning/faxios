# Request config

The request config is used to configure the request. There is a wide range of options available, but the only required option is `url`. If the configuration object does not contain a `method` field, the default method is `GET`.

Every key must be an option on this page or a request option an installed [plugin](/pages/advanced/middleware#typed-request-options) declares. Any other key rejects the request with a `FaxiosError` whose `code` is `ERR_BAD_OPTION` and whose message names the key, so a typo such as `timout` fails instead of being ignored. Options removed from axios, such as `adapter`, `proxy` or `maxRedirects`, reject the same way, and the message says what to use instead. A key that differs from an option only by case, such as `baseUrl`, names the option it differs from.

::: warning Security: decompression-bomb protection is opt-in
By default `maxContentLength` and `maxBodyLength` are `-1` (unlimited). A malicious or compromised server can return a tiny gzip/deflate/brotli/zstd body that expands to gigabytes and exhaust memory. The fetch adapter enforces these caps in every runtime.

If you call servers you do not fully trust, **set a cap**:

```js
import faxios from "@gcmdev/faxios";

faxios.defaults.maxContentLength = 10 * 1024 * 1024; // 10 MB
faxios.defaults.maxBodyLength = 10 * 1024 * 1024;
```

See the [security guide](/pages/misc/security) for details.
:::

### `url`

The `url` is the URL to which the request is made. It can be a string or an instance of `URL`. Any other value rejects with `ERR_BAD_OPTION_VALUE`. Outside the browser a relative `url` needs a [`baseURL`](#baseurl), or the request rejects with `ERR_INVALID_URL`.

### `method`

The `method` is the HTTP method to use for the request. The default method is `GET`. Any HTTP method name works, including extension methods such as `PROPFIND`. Leaving `method` out, or setting it to `undefined` or `null`, uses the instance's method, or `GET`. Any other value that isn't a valid method name, including `""`, `0` and `false`, rejects with `ERR_BAD_OPTION_VALUE`.

### `baseURL`

The `baseURL` is the base URL to be prepended to the `url` unless the `url` is an absolute URL. This is useful for making requests to the same domain without having to repeat the domain name and any api or version prefix. A `url` is absolute only when it starts with a scheme followed by `//` (`https://…`), as in axios. A relative path whose first segment has a colon, such as `documents:batchGet` or `localhost:3000/x`, is joined to `baseURL` like any other relative path.

A `url`, or a `baseURL` that is joined to it, containing a tab or a line break (`\t`, `\n`, `\r`) rejects with `ERR_INVALID_URL` ("Invalid URL: contains a tab or line break") before the request is sent, and `getUri()` throws the same error. The URL parser drops these characters wherever they are, so `"https:\t//host"` would otherwise be read as relative by faxios and as `https://host` by `fetch`. Write the URL without them.

### `allowAbsoluteUrls`

The `allowAbsoluteUrls` determines whether or not absolute URLs will override a configured `baseURL`. When `true`, absolute values for `url` override `baseURL`. When `false` and a `baseURL` is set, an absolute `url` rejects with `ERR_INVALID_URL` ("absolute URL with baseURL; set allowAbsoluteUrls: true") before the request is sent, and `getUri()` throws the same error. Without a `baseURL`, an absolute `url` is used as-is.

If you do not set it, faxios uses the instance default. When the instance defaults set neither `allowAbsoluteUrls` nor `baseURL`, it is `true`; when the instance defaults set `baseURL`, it is `false`.

### `transformRequest`

The `transformRequest` function allows you to modify the request data before it is sent to the server. Each function is called with the request data and the request headers, and may modify the headers object. This is only applicable for request methods `PUT`, `POST`, `PATCH` and `DELETE`. The last function in the array must return a string or an instance of Buffer, ArrayBuffer, FormData or Stream.

### `transformResponse`

The `transformResponse` function allows you to modify the response data before it is passed to the `then` or `catch` functions. Each function is called with the response data, the response headers and the HTTP status code, and returns the new data.

### `parseReviver`

The `parseReviver` function allows you to provide a custom "reviver" function directly to the native `JSON.parse()` call used by the default `transformResponse`.

This is particularly useful for performing high-performance type hydration (e.g., converting ISO strings to `Temporal` or `Date` objects) or preventing precision loss during parsing.

In modern environments (ES2023+), the reviver function receives a third `context` argument. This provides access to the raw JSON `source`, allowing for precise conversion of large integers (BigInt) that would otherwise lose precision if parsed as standard JavaScript numbers.

> Note: `Temporal` is not yet available in every runtime faxios supports.

```js
import faxios from "@gcmdev/faxios";

const client = faxios.create({
  parseReviver: (key, value, context) => {
    // Example: Precision-safe BigInt parsing
    if (typeof value === 'number' && context?.source) {
      const isInteger = Number.isInteger(value);
      const isUnsafe = !Number.isSafeInteger(value);
      const isValidIntegerString = /^-?\d+$/.test(context.source);

      if (isInteger && isUnsafe && isValidIntegerString) {
        try {
          return BigInt(context.source);
        } catch {
          // Fallback: return original value if parsing fails
        }
      }
    }

    // Example: Hydrating dates into Temporal objects
    if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      typeof Temporal !== 'undefined' &&
      Temporal?.PlainDate
    ) {
      return Temporal.PlainDate.from(value);
    }

    return value;
  },
});
```

### `headers`

The `headers` are the HTTP headers to be sent with the request. When you don't set `Content-Type`, faxios picks it from the body:

- Plain objects are sent as JSON with `application/json`.
- `URLSearchParams` is sent as `application/x-www-form-urlencoded;charset=utf-8`.
- `FormData` gets `multipart/form-data` with the boundary the runtime encoded the body with. faxios drops any `Content-Type` you set for a `FormData` body, including a `boundary` of your own, since only the encoder's boundary matches the body.
- `Blob`, `File`, `ArrayBuffer`, typed arrays, `DataView` and streams get no `Content-Type` from faxios. The runtime uses `Blob.type` (for example `image/png` for a `File`) or sends none.
- Plain strings get no `Content-Type` from faxios. The runtime sends `text/plain;charset=UTF-8`. Set the header yourself if the server expects something else, such as `application/x-www-form-urlencoded` for an `a=1&b=2` string, or set it to `null` to send the string with no `Content-Type`.

### `params`

The `params` are the URL parameters to be sent with the request. This must be a plain object or a URLSearchParams object. If the `url` contains query parameters, they will be merged with the `params` object.

### `paramsSerializer`

The `paramsSerializer` function allows you to serialize the `params` object before it is sent to the server. Pass a function, or an object with the `encode` and `serialize` functions and the `formSerializer` options below; see the full request config example at the end of this page. An object key faxios doesn't know (`indexs`) rejects with `ERR_BAD_OPTION`, and a value of the wrong type with `ERR_BAD_OPTION_VALUE`; both errors carry `error.config`. `getUri()` applies the same checks.

#### Strict RFC 3986 percent-encoding

By default, faxios decodes `%3A`, `%24`, `%2C` and `%20` back to `:`, `$`, `,` and `+` for readability (the `+` follows the `application/x-www-form-urlencoded` convention for spaces in query strings). These characters are valid in a query component under [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986#section-3.4), so the default output is correct. However, some backends require strict percent-encoding and reject the readable form.

Use the `encode` option to override the default encoder:

```js
import faxios from "@gcmdev/faxios";

// Per-request: emit strict RFC 3986 percent-encoding for query values
faxios.get('/foo', {
  params: { filter: JSON.stringify({ startedAt: '2026-01-23' }) },
  paramsSerializer: { encode: encodeURIComponent }
});

// Or set it on the instance defaults
const client = faxios.create({
  paramsSerializer: { encode: encodeURIComponent }
});
```

### `data`

The `data` is the data to be sent as the request body. This can be a string, a plain object, a Buffer, ArrayBuffer, FormData, Stream, or URLSearchParams. Only applicable for request methods `PUT`, `POST`, `DELETE` , and `PATCH`. When no `transformRequest` is set, must be of one of the following types:

- string, plain object, ArrayBuffer, ArrayBufferView, URLSearchParams
- FormData, File, Blob (available in all supported runtimes)
- ReadableStream

When faxios wraps a `ReadableStream` body to report `onUploadProgress` or enforce `maxBodyLength`, it sends every byte of each chunk: a typed array or `DataView` keeps all its bytes, an `ArrayBuffer` is sent whole and a string is UTF-8 encoded. Any other chunk rejects the request with a `FaxiosError` whose code is `ERR_BAD_REQUEST`.

For `FormData`, do not set `Content-Type`; faxios removes it so the header carries the boundary the runtime encoded the body with.

The body must be the runtime's global `FormData`. An instance of the npm `form-data` package (an object with `getHeaders()`) rejects with a `FaxiosError` whose code is `ERR_NOT_SUPPORT`, before anything is sent, because `fetch` cannot read it.

### `timeout`

The `timeout` is the number of milliseconds the whole request may take. It starts when you call faxios, before any middleware runs, and covers everything until the promise settles: [middleware](/pages/advanced/middleware), async schemas, every [`retry`](/pages/advanced/retry) try and the waits between them, the `fetch` call and reading the body. When it passes, the request rejects at once with a `FaxiosError` whose code is `ETIMEDOUT` (message `timeout of <n>ms exceeded`, or `timeoutErrorMessage` when you set one), even while a middleware is still waiting, and any `fetch` in flight is aborted. A timed-out request is not retried. The default is `0` (no timeout). It must be a number from `0` to `2147483647` (the longest delay `setTimeout` supports, about 24.8 days); anything else, including `NaN` and `Infinity`, rejects with `ERR_BAD_OPTION_VALUE` before any middleware runs.

The deadline is armed from the merged config before middleware runs, so a middleware that changes `ctx.config.timeout` doesn't move it. While the deadline runs, `ctx.config.signal` is a signal faxios builds: it aborts when your [`signal`](#signal) does, with your reason, or at the deadline. To bound each retry try separately, use the `retry` plugin's [`attemptTimeout`](/pages/advanced/retry#timeouts).

```js
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

// At most 10 seconds in all, and at most 3 seconds for each of up to 3 tries.
const api = faxios.create({ baseURL: "https://api.example.com", timeout: 10_000 })
  .use(retry({ attempts: 3, attemptTimeout: 3_000 }));

await api.get("/users");
```

With `responseType: "stream"`, the request isn't over when the promise resolves. The `timeout` and the [`signal`](#signal) stay active until you have read the whole body or cancelled it, so a slow or stalled body still times out, counted from when the request started, and aborting the signal stops it. Reading the stream then fails with the `ETIMEDOUT` or `ERR_CANCELED` error. faxios releases the timer and the signal listener when the body ends, errors or is cancelled. If the response has no body (a `204`, `304` or `HEAD` response), it releases them when the promise resolves. A status error works the same way: when a `404` rejects with `ERR_BAD_REQUEST`, `error.response.data` is the open stream, so read it for the server's error body or cancel it.

### `withCredentials`

The `withCredentials` property maps to the fetch `credentials` mode. `true` sends `credentials: "include"`, so cross-site requests carry credentials such as cookies, authorization headers, or TLS client certificates. `false` or unset sends `credentials: "same-origin"`, so same-origin requests still carry cookies and cross-site requests don't. A string value is passed to `fetch` as the `credentials` mode unchanged. The default is `false`. It only controls whether the browser sends credentials; it does not control whether the XSRF header is added (see [`withXSRFToken`](#withxsrftoken)).

### `auth`

`auth` indicates that HTTP Basic auth should be used, and supplies credentials. This will set an `Authorization` header, overwriting any existing `Authorization` custom headers you have set using `headers`. If `auth` is omitted, the fetch adapter can derive Basic auth credentials from the request URL, for example `https://user:pass@example.com`; percent-encoded URL credentials are decoded, and `auth` always takes precedence over URL-embedded credentials. Please note that only HTTP Basic auth is configurable through this parameter. For Bearer tokens and such, use `Authorization` custom headers instead.

### `responseType`

The `responseType` tells faxios how to read the response body. Values are matched case-insensitively:

- `arraybuffer`: `response.arrayBuffer()`, so `data` is an `ArrayBuffer`
- `blob`: `response.blob()`, so `data` is a `Blob`
- `formdata`: `response.formData()`, so `data` is a `FormData`
- `text`: `response.text()`, so `data` is a string and is not JSON-parsed
- `stream`: `data` is the `ReadableStream` from `response.body`
- `json`: read as text, then JSON-parsed. A 2xx body that isn't valid JSON rejects with a `FaxiosError` whose `code` is `ERR_BAD_RESPONSE`; the `SyntaxError` is on `error.cause` and the raw body on `error.response.data`. A 4xx or 5xx response with such a body (an HTML error page from a proxy, say) rejects with its status error instead, `ERR_BAD_REQUEST` or `ERR_BAD_RESPONSE` with `Request failed with status code N`; the raw body is on `error.response.data` and the parse error on `error.cause`

Any other value, including the `document` and `response` values faxios used to accept, rejects with `ERR_BAD_OPTION_VALUE`.

If `responseType` is unset, the body is read as text and then JSON-parsed if it parses; otherwise `data` is the raw string and the request still resolves. Binary bodies such as images or zip files are decoded as UTF-8 text in that case and come back corrupted, so set `responseType: "arraybuffer"` (or `"blob"`/`"stream"`) for them.

`responseType` doesn't change the TypeScript type of `data`, which is `unknown` unless you pass a type argument.

#### Downloading a file

```ts
import faxios from "@gcmdev/faxios";

const { data } = await faxios.get<ArrayBuffer>("https://example.com/report.zip", {
  responseType: "arraybuffer",
});
console.log(data.byteLength);
```

The whole body is buffered in memory. When the server isn't trusted, set [`maxContentLength`](#maxcontentlength) to cap the download size.

Text is always decoded as UTF-8. For another encoding, read the body with `responseType: "arraybuffer"` and decode it with a `TextDecoder`:

```ts
import faxios from "@gcmdev/faxios";

const { data } = await faxios.get<ArrayBuffer>("https://example.com/legacy.txt", {
  responseType: "arraybuffer",
});
console.log(new TextDecoder("latin1").decode(data));
```

### `xsrfCookieName`

The `xsrfCookieName` is the name of the cookie to use as a value for `XSRF` token. The default is `XSRF-TOKEN`.

### `xsrfHeaderName`

The `xsrfHeaderName` is the name of the header to use as a value for `XSRF` token. The default is `X-XSRF-TOKEN`.

### `withXSRFToken`

`withXSRFToken` controls whether faxios reads the XSRF cookie and sets the XSRF header on browser requests. It accepts:

- `undefined` _(default)_ — set the XSRF header only for same-origin requests.
- `true` — always set the XSRF header, including for cross-origin requests.
- `false` — never set the XSRF header.
- `(config: InternalFaxiosRequestConfig) => boolean | undefined` — a callback that decides per-request, receiving the internal config object.

```ts check=skip
withXSRFToken: boolean | undefined | ((config: InternalFaxiosRequestConfig) => boolean | undefined);
```

When faxios sets the XSRF header and the request doesn't set [`fetchOptions.redirect`](/pages/advanced/fetch-adapter#fetch-options), it sends the request with `redirect: "error"`. `fetch` drops only `Authorization` when a redirect leaves the origin, so following one would send the token to whatever host the redirect points at. A redirect then rejects with `ERR_NETWORK`. To follow redirects anyway, set `fetchOptions: { redirect: "follow" }` on the request, but only for an API whose redirects you trust.

::: warning Cross-origin XSRF and `withCredentials`
`withCredentials` controls whether cross-site requests include credentials (cookies, HTTP auth). `withXSRFToken` controls whether faxios sets the XSRF header. For cross-origin requests, set `withXSRFToken: true` to force the header; additionally set `withCredentials: true` only when the request also needs credentials/cookies.

```js
import faxios from "@gcmdev/faxios";

faxios.get('/user', { withCredentials: true, withXSRFToken: true });
```
:::

### `onDownloadProgress`

The `onDownloadProgress` function allows you to listen to the progress of a download.

`onUploadProgress` works the same way for the request body. `onUploadProgress` is called only where faxios can stream the request body, which today is Node.js. In browsers and web workers faxios never streams the body for progress, so the callback is not called. See [Fetch adapter](/pages/advanced/fetch-adapter) for details and [#209](https://github.com/adrianbrowning/faxios/issues/209) for upload progress in browsers.

For a compressed response (any `Content-Encoding` other than `identity`), `total` is `undefined` and `lengthComputable` is `false`, because `Content-Length` is the compressed size.

If either callback throws, or returns a promise that rejects, faxios catches and ignores the error. The request carries on and settles normally.

### `maxContentLength`

The `maxContentLength` property defines the maximum response size in bytes. A response of exactly `maxContentLength` bytes is allowed; one byte more is rejected. The fetch adapter enforces it when the response length is declared, the response stream can be tracked, or the response size can otherwise be determined. When there's no stream to track (the runtime has no stream responses, or an `env.fetch` returns a Response-like value without a stream `body`), faxios measures the body once it's read: a string in UTF-8 bytes, an `ArrayBuffer` or `Blob` by its size. When a response goes over the limit, faxios rejects with `ERR_BAD_RESPONSE` and aborts the request, so the connection is closed instead of left downloading. A `HEAD` response and a `204`, `205` or `304` response have no body, so the `Content-Length` they declare isn't checked against the limit.

> ⚠️ **Security:** defaults to `-1` (unlimited). Unbounded responses combined with gzip/deflate/brotli/zstd decompression allow decompression-bomb DoS.
> Set an explicit limit when requesting servers you do not fully trust.

### `maxBodyLength`

The `maxBodyLength` property defines the maximum request body size in bytes. A body of exactly `maxBodyLength` bytes is allowed; one byte more is rejected. faxios checks the body's real size, never a `Content-Length` header you set:

- A string, `URLSearchParams`, `Blob`, `ArrayBuffer` or typed array body is measured before the request is sent. A string counts its UTF-8 bytes (`"é"` is 2), worked out without encoding a copy of it.
- A stream body is counted as it is sent, and the request fails once it passes the limit. Where the runtime's `fetch` can't stream a request body, a stream body with `maxBodyLength` set is rejected with `ERR_NOT_SUPPORT`.
- A `FormData` body is not read into memory to measure it. Before sending, faxios adds up the sizes of its string values and files and rejects the request if they alone pass the limit. In Node.js the body is then streamed and counted as it is sent, so the multipart boundaries and part headers count too. In browsers, Deno and Bun it isn't streamed (see [Fetch adapter](/pages/advanced/fetch-adapter)), so the boundaries and part headers are not counted: a `FormData` body whose values fit under the limit is sent even when the whole multipart body is slightly larger.

### `redact`

The `redact` property is an optional array of extra config key names to mask when an `FaxiosError` is serialized with `toJSON()`. `toJSON()` always masks `authorization`, `proxy-authorization`, `cookie` and `auth` and strips `user:pass@` from `url` and `baseURL`; `redact` adds to those keys and can't remove them. Matching is case-insensitive and recursive across the serialized request config, the request body you passed included. Matching values are replaced with `[REDACTED ****]`.

A request's `redact` adds to the instance's: with `faxios.create({ redact: ['x-api-key'] })`, a request with `redact: ['password']` masks both. The merged list is lower-cased and has no duplicates.

`redact` only affects error serialization. It does not change request data, headers, or the original config object. See [Error handling](/pages/advanced/error-handling#handling-errors) for what `toJSON()` still logs as it is.

```js status=500
import faxios from "@gcmdev/faxios";

faxios.get('/user/12345', {
  headers: { 'X-Api-Key': 'key' },
  params: { token: 'secret' },
  redact: ['x-api-key', 'token']
}).catch((error) => {
  console.log(error.toJSON().config);
});
```

### `validateStatus`

The `validateStatus` function allows you to override the default status code validation. By default, faxios will reject the promise if the status code is not in the range of 200-299. You can override this behavior by providing a custom `validateStatus` function. The function should return `true` if the status code is within the range you want to accept.

If `validateStatus` is set to `null`, faxios resolves every response. An explicit `validateStatus: undefined` counts as not set, so the instance's or the default validator applies, unless `transitional.validateStatusUndefinedResolves` is `true`.

Every other option set to `undefined` also counts as not set and keeps the instance value, except `xsrfCookieName` and `xsrfHeaderName`, where `undefined` clears it. See [Config defaults](/pages/advanced/config-defaults#an-option-set-to-undefined).

### `signal`

The `signal` property allows you to pass an instance of `AbortSignal` to the request. This allows you to cancel the request using the `AbortController` API. An abort rejects the request at once with a `CanceledError` (code `ERR_CANCELED`) at every stage, including while a middleware or an async schema is still running. If you abort with a reason (`controller.abort(reason)`), the error keeps it: an `Error` reason becomes the error's `cause` and gives it its message, and a string reason becomes the message. For `responseType: "stream"`, the signal can also cancel the body while you read it (see [`timeout`](#timeout)).

### `transitional`

The `transitional` property allows you to enable or disable certain transitional features. Any key not listed here rejects with `ERR_BAD_OPTION`. The following options are available:

- `forcedJSONParsing`: Forces faxios to parse the response string as JSON even if `responseType` is not `'json'`.
- `clarifyTimeoutError`: Accepted for compatibility but has no effect. Timed-out requests always reject with `ETIMEDOUT`.
- `validateStatusUndefinedResolves`: When `false` _(default)_, an explicit `validateStatus: undefined` behaves like an omitted option, so the instance's or the default validator applies (reject non-2xx). Set to `true` to make it resolve every response status (the behavior before 0.3.0); `validateStatus: null` does that without this flag.

There is no `silentJSONParsing` option any more, and passing it rejects with `ERR_BAD_OPTION`. An explicit `responseType: "json"` always rejects a body that isn't valid JSON (see [`responseType`](#responsetype)); leave `responseType` unset to get the raw string instead.

### `env`

The `env` property allows you to set some configuration options. For example the FormData class which is used to automatically serialize the payload into a FormData object.

- FormData: the runtime's global `FormData`

`env` also accepts custom `fetch`, `Request`, and `Response` implementations for the fetch adapter. See [Custom fetch](/pages/advanced/fetch-adapter#custom-fetch).

### `formSerializer`

The `formSerializer` option allows you to configure how plain objects are serialized to `multipart/form-data` when used as request `data`. Available options:

- `visitor` — custom visitor function called recursively for each value
- `dots` — use dot notation instead of bracket notation
- `metaTokens` — preserve special key endings such as `{}`
- `indexes` — control bracket format for array keys (`null` / `false` / `true`)
- `maxDepth` _(default: `100`)_ — maximum nesting depth before throwing `FaxiosError` with code `ERR_FORM_DATA_DEPTH_EXCEEDED`. Set to `Infinity` to disable. Any other value that isn't a non-negative integer, such as `NaN` or `-1`, rejects with `ERR_BAD_OPTION_VALUE`.

Any other key (`dot`) rejects with `ERR_BAD_OPTION`, and a value of the wrong type with `ERR_BAD_OPTION_VALUE`.

See the [multipart/form-data](/pages/advanced/multipart-form-data-format) page for full details, and the full request config example at the end of this page.

### Schema options

The following options validate request inputs and response data with any Standard Schema v1 compliant schema (Zod, Valibot, ArkType). See [Schema validation](/pages/advanced/schema-validation) for details.

- `responseSchema` — validates `response.data` after `transformResponse`; rejects with `ERR_BAD_RESPONSE_SCHEMA` on failure. TypeScript infers the `response.data` type from the schema's output type.
- `requestSchema` — validates `config.data` before sending; rejects with `ERR_BAD_REQUEST_SCHEMA`.
- `paramsSchema` — validates `config.params` before URL construction; rejects with `ERR_BAD_PARAMS_SCHEMA`. The schema's output replaces `params`, so it must be an object, `URLSearchParams`, `null` or `undefined`; any other output also rejects with `ERR_BAD_PARAMS_SCHEMA`.
- `pathParams` — substitutes `{key}` placeholders in the URL.
- `pathParamsSchema` — validates `pathParams` before substitution; rejects with `ERR_BAD_PATH_PARAMS_SCHEMA`. When set, `pathParams` is required.

## Full request config example

```ts
import type { FaxiosRequestConfig } from "@gcmdev/faxios";
import { z } from "zod";

const config: FaxiosRequestConfig = {
  url: "/posts/{id}",
  method: "get",
  baseURL: "https://jsonplaceholder.typicode.com",
  allowAbsoluteUrls: true,
  transformRequest: [function (data, headers) {
    return data;
  }],
  transformResponse: [function (data) {
    return data;
  }],
  headers: { "X-Requested-With": "XMLHttpRequest" },
  params: {
    postId: 5
  },
  paramsSerializer: {
    // Custom encoder function which sends key/value pairs in an iterative fashion.
    encode: (param, defaultEncoder) => defaultEncoder(param),

    // Custom serializer function for the entire parameter. Allows user to mimic pre 1.x behaviour.
    serialize: (params, options) => new URLSearchParams(params as Record<string, string>).toString(),

    // Configuration for formatting array indexes in the params.
    // Three available options:
    //   (1) indexes: null (leads to no brackets)
    //   (2) (default) indexes: false (leads to empty brackets)
    //   (3) indexes: true (leads to brackets with indexes).
    indexes: false,

    // Maximum nesting depth of `params` (default 100); deeper objects throw ERR_FORM_DATA_DEPTH_EXCEEDED.
    maxDepth: 100,
  },
  data: {
    firstName: "Fred"
  },
  // Syntax alternative: a string body is sent as is, with `text/plain;charset=UTF-8` unless you set
  // `Content-Type` (e.g. `application/x-www-form-urlencoded` for this one). With a JSON
  // `Content-Type` it is sent as the JSON text you wrote, trimmed, and is never parsed or quoted
  // data: "Country=Brasil&City=Belo Horizonte",
  timeout: 1000,
  withCredentials: false,
  auth: {
    username: "janedoe",
    password: "s00pers3cret"
  },
  responseType: "json",
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  // boolean, or a function that decides per request
  withXSRFToken: (config) => config.url?.startsWith("/") ?? false,
  onDownloadProgress: function ({ loaded, total, progress, bytes, estimated, rate, download = true }) {
    // Do whatever you want with the faxios progress event
  },
  maxContentLength: -1,
  maxBodyLength: -1,
  redact: ["authorization", "password"],
  validateStatus: function (status) {
    return status >= 200 && status < 300;
  },
  signal: new AbortController().signal,
  transitional: {
    forcedJSONParsing: true,
    clarifyTimeoutError: false,
    validateStatusUndefinedResolves: false,
  },
  responseSchema: z.object({ id: z.number(), title: z.string() }),
  requestSchema: z.object({ firstName: z.string() }),
  paramsSchema: z.object({ postId: z.number() }),
  pathParams: { id: "123" },
  pathParamsSchema: z.object({ id: z.string() }),
  env: {
    fetch: globalThis.fetch
  },
  formSerializer: {
    // Custom visitor function to serialize form values
    visitor: function (value, key, path, helpers) {
      return helpers.defaultVisitor.call(this, value, key, path, helpers);
    },

    // Use dots instead of brackets format
    dots: false,

    // Keep special endings like {} in parameter key
    metaTokens: true,

    // Use array indexes format:
    //   null - no brackets
    //   false - empty brackets
    //   true - brackets with indexes
    indexes: false,

    // Maximum nesting depth of `data` (default 100); deeper objects throw ERR_FORM_DATA_DEPTH_EXCEEDED.
    maxDepth: 100,

    // Blob constructor used to wrap ArrayBuffer and typed-array values (default: globalThis.Blob).
    // Binary values on a FormData that isn't spec-compliant throw ERR_NOT_SUPPORT.
    Blob: globalThis.Blob,
  }
};
```
