# Request config

The request config is used to configure the request. There is a wide range of options available, but the only required option is `url`. If the configuration object does not contain a `method` field, the default method is `GET`.

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

The `url` is the URL to which the request is made. It can be a string or an instance of `URL`.

### `method`

The `method` is the HTTP method to use for the request. The default method is `GET`.

### `baseURL`

The `baseURL` is the base URL to be prepended to the `url` unless the `url` is an absolute URL. This is useful for making requests to the same domain without having to repeat the domain name and any api or version prefix.

### `allowAbsoluteUrls`

The `allowAbsoluteUrls` determines whether or not absolute URLs will override a configured `baseURL`. When `true`, absolute values for `url` override `baseURL`. When `false`, absolute values for `url` are always prepended by `baseURL`.

If you do not set it, faxios uses the instance default. When the instance defaults set neither `allowAbsoluteUrls` nor `baseURL`, it is `true`; when the instance defaults set `baseURL`, it is `false`.

### `transformRequest`

The `transformRequest` function allows you to modify the request data before it is sent to the server. Each function is called with the request data and the request headers, and may modify the headers object. This is only applicable for request methods `PUT`, `POST`, `PATCH` and `DELETE`. The last function in the array must return a string or an instance of Buffer, ArrayBuffer, FormData or Stream.

### `transformResponse`

The `transformResponse` function allows you to modify the response data before it is passed to the `then` or `catch` functions. Each function is called with the response data, the response headers and the HTTP status code, and returns the new data.

### `parseReviver`

The `parseReviver` function allows you to provide a custom "reviver" function directly to the native `JSON.parse()` call used by the default `transformResponse`.

This is particularly useful for performing high-performance type hydration (e.g., converting ISO strings to `Temporal` or `Date` objects) or preventing precision loss during parsing.

In modern environments (ES2023+), the reviver function receives a third `context` argument. This provides access to the raw JSON `source`, allowing for precise conversion of large integers (BigInt) that would otherwise lose precision if parsed as standard JavaScript numbers.

> Note: `Temporal` is not yet available in all environments. Consider using a polyfill if needed.

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

The `headers` are the HTTP headers to be sent with the request. The `Content-Type` header is set to `application/json` by default.

### `params`

The `params` are the URL parameters to be sent with the request. This must be a plain object or a URLSearchParams object. If the `url` contains query parameters, they will be merged with the `params` object.

### `paramsSerializer`

The `paramsSerializer` function allows you to serialize the `params` object before it is sent to the server. There are a few options available for this function, so please refer to the full request config example at the end of this page.

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

For `FormData`, do not manually set `Content-Type`; the runtime adds the multipart boundary.

If a `FormData`-like object provides a `getHeaders()` method, faxios copies all returned headers by default for v1 compatibility. If the object is custom or not fully trusted, set `formDataHeaderPolicy: 'content-only'` to copy only `Content-Type` and `Content-Length`, and set any other request headers explicitly via the request `headers` config.

### `formDataHeaderPolicy`

Controls how faxios copies headers returned by a `FormData`-like object's `getHeaders()` method. The default is `'legacy'`, which copies all returned headers to preserve existing v1 behavior. Set `'content-only'` to copy only `Content-Type` and `Content-Length` from `getHeaders()`.

### `timeout`

The `timeout` is the number of milliseconds before the request times out. If the request takes longer than `timeout`, the request will be aborted. The default is `0` (no timeout).

### `withCredentials`

The `withCredentials` property indicates whether or not cross-site Access-Control requests should be made using credentials such as cookies, authorization headers, or TLS client certificates. Setting withCredentials has no effect on same-site requests. The default is `false`. It only controls whether the browser sends credentials; it does not control whether the XSRF header is added (see [`withXSRFToken`](#withxsrftoken)).

### `auth`

`auth` indicates that HTTP Basic auth should be used, and supplies credentials. This will set an `Authorization` header, overwriting any existing `Authorization` custom headers you have set using `headers`. If `auth` is omitted, the fetch adapter can derive Basic auth credentials from the request URL, for example `https://user:pass@example.com`; percent-encoded URL credentials are decoded, and `auth` always takes precedence over URL-embedded credentials. Please note that only HTTP Basic auth is configurable through this parameter. For Bearer tokens and such, use `Authorization` custom headers instead.

### `responseType`

The `responseType` indicates the type of data that the server will respond with. This can be one of the following:

- arraybuffer
- document
- json
- text
- stream
- blob (browser only)
- formdata (fetch adapter only)

### `responseEncoding` <Badge type="warning" text="Node.js only" />

The `responseEncoding` indicates encoding to use for decoding responses. The following options are supported:

- ascii
- ASCII
- ansi
- ANSI
- binary
- BINARY
- base64
- BASE64
- base64url
- BASE64URL
- hex
- HEX
- latin1
- LATIN1
- ucs-2
- UCS-2
- ucs2
- UCS2
- utf-8
- UTF-8
- utf8
- UTF8
- utf16le
- UTF16LE

::: tip
Note: Ignored for `responseType` of `stream` or client-side requests
:::

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

::: warning Cross-origin XSRF and `withCredentials`
`withCredentials` controls whether cross-site requests include credentials (cookies, HTTP auth). `withXSRFToken` controls whether faxios sets the XSRF header. For cross-origin requests, set `withXSRFToken: true` to force the header; additionally set `withCredentials: true` only when the request also needs credentials/cookies.

```js
import faxios from "@gcmdev/faxios";

faxios.get('/user', { withCredentials: true, withXSRFToken: true });
```
:::

### `onDownloadProgress`

The `onDownloadProgress` function allows you to listen to the progress of a download.

`onUploadProgress` works the same way for the request body. faxios reports upload progress by streaming the request body, so `onUploadProgress` only fires where the runtime's `fetch` supports streaming request bodies (`duplex: "half"`), as Node.js does. Where it doesn't, the callback is not called.

### `maxContentLength`

The `maxContentLength` property defines the maximum response size in bytes. The fetch adapter enforces it when the response length is declared, the response stream can be tracked, or the response size can otherwise be determined.

> ⚠️ **Security:** defaults to `-1` (unlimited). Unbounded responses combined with gzip/deflate/brotli/zstd decompression allow decompression-bomb DoS.
> Set an explicit limit when requesting servers you do not fully trust.

### `maxBodyLength`

The `maxBodyLength` property defines the maximum request body size in bytes. The fetch adapter enforces it when the request body length can be determined.

### `redact`

The `redact` property is an optional array of config key names to mask when an `FaxiosError` is serialized with `toJSON()`. Matching is case-insensitive and recursive across the serialized request config. Matching values are replaced with `[REDACTED ****]`.

`redact` only affects error serialization. It does not change request data, headers, or the original config object.

```js status=500
import faxios from "@gcmdev/faxios";

faxios.get('/user/12345', {
  headers: { Authorization: 'Bearer token' },
  auth: { username: 'me', password: 'secret' },
  redact: ['authorization', 'password']
}).catch((error) => {
  console.log(error.toJSON().config);
});
```

### `validateStatus`

The `validateStatus` function allows you to override the default status code validation. By default, faxios will reject the promise if the status code is not in the range of 200-299. You can override this behavior by providing a custom `validateStatus` function. The function should return `true` if the status code is within the range you want to accept.

If `validateStatus` is set to `null`, faxios resolves every response. An explicit `validateStatus: undefined` also resolves every response unless `transitional.validateStatusUndefinedResolves` is `false`.

### `signal`

The `signal` property allows you to pass an instance of `AbortSignal` to the request. This allows you to cancel the request using the `AbortController` API.

### `transitional`

The `transitional` property allows you to enable or disable certain transitional features. The following options are available:

- `silentJSONParsing`: If set to `true` _(default)_, faxios silently ignores JSON parsing errors and sets `response.data` to `null` when parsing fails. Set to `false` to throw `SyntaxError` instead.

  ::: tip Important
  This option only takes effect when `responseType` is **explicitly** set to `'json'`. When `responseType` is omitted, faxios uses `forcedJSONParsing` to attempt JSON parsing and silently returns the raw string on failure regardless of this setting. To make invalid JSON throw, set both:

  ```js
  import faxios from "@gcmdev/faxios";

  await faxios.get("/data", { responseType: "json", transitional: { silentJSONParsing: false } });
  ```
  :::

- `forcedJSONParsing`: Forces faxios to parse the response string as JSON even if `responseType` is not `'json'`.
- `clarifyTimeoutError`: Accepted for compatibility but has no effect. Timed-out requests always reject with `ETIMEDOUT`.
- `advertiseZstdAcceptEncoding`: When set to `true`, faxios adds `zstd` to the default `Accept-Encoding` request header. Response decompression is handled by the runtime's `fetch` implementation.
- `validateStatusUndefinedResolves`: When `true` _(default)_, an explicit `validateStatus: undefined` resolves every response status (legacy behavior). Set to `false` to make an explicit `undefined` behave like an omitted option, so the configured or default validator applies (reject non-2xx).
- `legacyInterceptorReqResOrdering`: When `true` _(default)_, request interceptors run last-registered-first (LIFO). Set to `false` to run request interceptors in registration order. Response interceptors always run in registration order. See [Interceptor execution order](/pages/advanced/interceptors#interceptor-execution-order).

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
- `maxDepth` _(default: `100`)_ — maximum nesting depth before throwing `FaxiosError` with code `ERR_FORM_DATA_DEPTH_EXCEEDED`. Set to `Infinity` to disable.

See the [multipart/form-data](/pages/advanced/multipart-form-data-format) page for full details, and the full request config example at the end of this page.

### Schema options

The following options validate request inputs and response data with any Standard Schema v1 compliant schema (Zod, Valibot, ArkType). See [Schema validation](/pages/advanced/schema-validation) for details.

- `responseSchema` — validates `response.data` after `transformResponse`; rejects with `ERR_BAD_RESPONSE_SCHEMA` on failure. TypeScript infers the `response.data` type from the schema's output type.
- `requestSchema` — validates `config.data` before sending; rejects with `ERR_BAD_REQUEST_SCHEMA`.
- `paramsSchema` — validates `config.params` before URL construction; rejects with `ERR_BAD_PARAMS_SCHEMA`.
- `pathParams` — substitutes `{key}` placeholders in the URL.
- `pathParamsSchema` — validates `pathParams` before substitution; rejects with `ERR_BAD_PATH_PARAMS_SCHEMA`. When set, `pathParams` is required.

## Full request config example

```ts check=skip
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
  // Syntax alternative to send data into the body method post only the value is sent, not the key
  // data: "Country=Brasil&City=Belo Horizonte",
  formDataHeaderPolicy: "legacy",
  timeout: 1000,
  withCredentials: false,
  auth: {
    username: "janedoe",
    password: "s00pers3cret"
  },
  responseType: "json",
  responseEncoding: "utf8",
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  // boolean, or a function that decides per request
  withXSRFToken: (config) => config.url?.startsWith("/") ?? false,
  onDownloadProgress: function ({ loaded, total, progress, bytes, estimated, rate, download = true }) {
    // Do whatever you want with the faxios progress event
  },
  maxContentLength: 2000,
  maxBodyLength: 2000,
  redact: ["authorization", "password"],
  validateStatus: function (status) {
    return status >= 200 && status < 300;
  },
  signal: new AbortController().signal,
  transitional: {
    silentJSONParsing: true,
    forcedJSONParsing: true,
    clarifyTimeoutError: false,
    advertiseZstdAcceptEncoding: false,
    validateStatusUndefinedResolves: true,
    legacyInterceptorReqResOrdering: true,
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
  }
};
```
