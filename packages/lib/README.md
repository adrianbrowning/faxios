# faxios

> Promise based HTTP client for the browser and node.js — a TypeScript-first fork of [axios](https://github.com/axios/axios).

[![npm version](https://img.shields.io/npm/v/@gcmdev/faxios.svg?style=flat-square)](https://www.npmjs.org/package/@gcmdev/faxios)

## Table of contents

- [Features](#features)
- [Browser support](#browser-support)
- [Installing](#installing)
  - [Package manager](#package-manager)
  - [CDN](#cdn)
- [Example](#example)
- [Faxios API](#faxios-api)
- [Request method aliases](#request-method-aliases)
- [Concurrency](#concurrency-deprecated)
- [Creating an instance](#creating-an-instance)
- [Instance methods](#instance-methods)
- [Request config](#request-config)
- [Response schema](#response-schema)
- [Config defaults](#config-defaults)
  - [Global faxios defaults](#global-faxios-defaults)
  - [Custom instance defaults](#custom-instance-defaults)
  - [Config order of precedence](#config-order-of-precedence)
- [Interceptors](#interceptors)
  - [Multiple interceptors](#multiple-interceptors)
- [Handling errors](#handling-errors)
- [Handling timeouts](#handling-timeouts)
- [Cancellation](#cancellation)
  - [AbortController](#abortcontroller)
  - [CancelToken](#canceltoken-deprecated)
- [Using application/x-www-form-urlencoded format](#using-applicationx-www-form-urlencoded-format)
  - [URLSearchParams](#urlsearchparams)
  - [Query string](#query-string-older-browsers)
  - [Automatic serialization](#automatic-serialization-to-urlsearchparams)
- [Using multipart/form-data format](#using-multipartform-data-format)
  - [FormData](#formdata)
  - [Automatic serialization](#automatic-serialization-to-formdata)
- [Posting files](#posting-files)
- [HTML form posting](#html-form-posting-browser)
- [Progress capturing](#progress-capturing)
- [FaxiosHeaders](#Faxiosheaders)
- [Fetch adapter](#fetch-adapter)
  - [Custom fetch](#custom-fetch)
    - [Using with Tauri](#using-with-tauri)
    - [Using with SvelteKit](#using-with-sveltekit)
- [Semver](#semver)
- [Promises](#promises)
- [TypeScript](#typescript)
- [Contributing](#contributing)
  - [Local setup](#local-setup)
- [Resources](#resources)
- [Credits](#credits)
- [License](#license)

## Features

- Make HTTP requests with the web-standard [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API in every runtime — browser, Node.js 18+, Deno, and Bun.
- Use the [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) API for asynchronous request handling.
- Intercept requests and responses to add custom logic or transform data.
- Transform request and response data.
- Cancel requests with built-in cancellation APIs.
- Serialize and parse [JSON](https://www.json.org/json-en.html) data.
- Serialize data objects to `multipart/form-data` or `application/x-www-form-urlencoded`.
- Add client-side protection against [Cross-Site Request Forgery](https://en.wikipedia.org/wiki/Cross-site_request_forgery).

## Browser support

|                                                     Chrome                                                     |                                                      Firefox                                                      |                                                     Safari                                                     |                                                    Opera                                                    |                                                   Edge                                                   |
| :------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------: |
| ![Chrome browser logo](https://raw.githubusercontent.com/alrra/browser-logos/main/src/chrome/chrome_48x48.png) | ![Firefox browser logo](https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox_48x48.png) | ![Safari browser logo](https://raw.githubusercontent.com/alrra/browser-logos/main/src/safari/safari_48x48.png) | ![Opera browser logo](https://raw.githubusercontent.com/alrra/browser-logos/main/src/opera/opera_48x48.png) | ![Edge browser logo](https://raw.githubusercontent.com/alrra/browser-logos/main/src/edge/edge_48x48.png) |
|                                                    Latest ✔                                                    |                                                     Latest ✔                                                      |                                                    Latest ✔                                                    |                                                  Latest ✔                                                   |                                                 Latest ✔                                                 |

[![Browser Matrix](https://saucelabs.com/open_sauce/build_matrix/faxios.svg)](https://saucelabs.com/u/faxios)

## Installing

### Package manager

Using npm:

```bash
$ npm install @gcmdev/faxios
```

Using yarn:

```bash
$ yarn add @gcmdev/faxios
```

Using pnpm:

```bash
$ pnpm add @gcmdev/faxios
```

Using bun:

```bash
$ bun add @gcmdev/faxios
```

Once the package is installed, import it with `import`:

```js
import faxios, { isCancel, FaxiosError } from '@gcmdev/faxios';
```

You can also use the default export, since the named export is just a re-export from the Faxios factory:

```js
import faxios from '@gcmdev/faxios';

console.log(faxios.isCancel('something'));
```


## Example

```js
import faxios from '@gcmdev/faxios';

try {
  const response = await faxios.get('/user?ID=12345');
  console.log(response);
} catch (error) {
  console.error(error);
}

// Optionally the request above could also be done as
faxios
  .get('/user', {
    params: {
      ID: 12345,
    },
    timeout: 5000, // 5 seconds. See "Handling Timeouts" below for matching error handling
  })
  .then(function (response) {
    console.log(response);
  })
  .catch(function (error) {
    console.log(error);
  })
  .finally(function () {
    // always executed
  });

// Want to use async/await? Add the `async` keyword to your outer function/method.
async function getUser() {
  try {
// Example: GET request with query parameters
const response = await faxios.get('/user', {
  params: {
    ID: 12345
  }
});

// Using the `params` option improves readability and automatically formats query strings

console.log(response);
  } catch (error) {
    console.error(error);
  }
}
```

> Note: Set a `timeout` in production. Without one, a stalled request can hang
> indefinitely. See [Handling Timeouts](#handling-timeouts) for the matching error handling.

> Note: `async/await` is part of ECMAScript 2017 and is not supported in Internet
> Explorer and older browsers, so use with caution.

Performing a `POST` request

```js
const response = await faxios.post('/user', {
  firstName: 'Fred',
  lastName: 'Flintstone',
});
console.log(response);
```

Performing multiple concurrent requests

```js
function getUserAccount() {
  return faxios.get('/user/12345');
}

function getUserPermissions() {
  return faxios.get('/user/12345/permissions');
}

Promise.all([getUserAccount(), getUserPermissions()]).then(function (results) {
  const acct = results[0];
  const perm = results[1];
});
```

## faxios API

Requests can be made by passing the relevant config to `faxios`.

##### faxios(config)

```js
// Send a POST request
faxios({
  method: 'post',
  url: '/user/12345',
  data: {
    firstName: 'Fred',
    lastName: 'Flintstone',
  },
});
```

```js
// GET request for remote image in node.js
const response = await faxios({
  method: 'get',
  url: 'https://bit.ly/2mTM3nY',
  responseType: 'stream',
});
response.data.pipe(fs.createWriteStream('ada_lovelace.jpg'));
```

##### faxios(url[, config])

```js
// Send a GET request (default method)
faxios('/user/12345');
```

### Request method aliases

For convenience, aliases have been provided for all common request methods.

##### faxios.request(config)

##### faxios.get(url[, config])

##### faxios.delete(url[, config])

##### faxios.head(url[, config])

##### faxios.options(url[, config])

##### faxios.post(url[, data[, config]])

##### faxios.put(url[, data[, config]])

##### faxios.patch(url[, data[, config]])

###### Note

When using the alias methods `url`, `method`, and `data` properties don't need to be specified in config.

### Concurrency (deprecated)

Use `Promise.all` instead of these helpers.

Helper functions for dealing with concurrent requests.

faxios.all(iterable)
faxios.spread(callback)

### Creating an instance

You can create a new instance of faxios with a custom config.

##### faxios.create([config])

```js
const instance = faxios.create({
  baseURL: 'https://some-domain.com/api/',
  timeout: 1000,
  headers: { 'X-Custom-Header': 'foobar' },
});
```

### Instance methods

The following instance methods are available. Faxios merges the specified config with the instance config.

##### faxios#request(config)

##### faxios#get(url[, config])

##### faxios#delete(url[, config])

##### faxios#head(url[, config])

##### faxios#options(url[, config])

##### faxios#post(url[, data[, config]])

##### faxios#put(url[, data[, config]])

##### faxios#patch(url[, data[, config]])

##### faxios#getUri([config])

## Request config

### Security notice: decompression-bomb protection is opt-in

By default `maxContentLength` and `maxBodyLength` are `-1` (unlimited). A malicious or compromised server can return a tiny gzip/deflate/brotli/zstd body that expands to gigabytes and exhaust the process. The fetch adapter enforces these caps in every runtime.

If you call servers you do not fully trust, **set a cap**:

```js
faxios.defaults.maxContentLength = 10 * 1024 * 1024; // 10 MB
faxios.defaults.maxBodyLength = 10 * 1024 * 1024;
```

See the [security guide](https://faxios.rest/pages/misc/security.html) for details.

These config options are available for requests. Only `url` is required. Requests default to `GET` when `method` is not set.

```js
{
  // `url` is the server URL for the request
  url: '/user',

  // `method` is the request method to be used when making the request
  method: 'get', // default

  // Faxios prepends `baseURL` to `url` unless `url` is absolute and `allowAbsoluteUrls` is set to true.
  // It can be convenient to set `baseURL` for an instance of faxios to pass relative URLs
  // to the methods of that instance.
  baseURL: 'https://some-domain.com/api/',

  // `allowAbsoluteUrls` determines whether or not absolute URLs will override a configured `baseUrl`.
  // When set to true (default), absolute values for `url` will override `baseUrl`.
  // When set to false, absolute values for `url` will always be prepended by `baseUrl`.
  allowAbsoluteUrls: true,

  // `transformRequest` allows changes to the request data before it is sent to the server
  // This is only applicable for request methods 'PUT', 'POST', 'PATCH' and 'DELETE'
  // The last function in the array must return a string or an instance of Buffer, ArrayBuffer,
  // FormData or Stream
  // You may modify the headers object.
  transformRequest: [function (data, headers) {
    // Do whatever you want to transform the data

    return data;
  }],

  // `transformResponse` allows changes to the response data to be made before
  // it is passed to then/catch
  transformResponse: [function (data) {
    // Do whatever you want to transform the data

    return data;
  }],

  // `parseReviver` is an optional function passed as the
  // second argument (reviver) to JSON.parse()
  parseReviver: function (key, value, context) {
    // In modern environments, context.source provides the raw JSON string
    // allowing for precision-safe parsing of BigInt
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
    return value;
  },

  // `headers` are custom headers to be sent
  headers: {'X-Requested-With': 'XMLHttpRequest'},

  // `params` are the URL parameters to be sent with the request
  // Must be a plain object or a URLSearchParams object
  params: {
    ID: 12345
  },

  // `paramsSerializer` is an optional config that allows you to customize serializing `params`.
  paramsSerializer: {

    // Custom encoder function which sends key/value pairs in an iterative fashion.
    encode?: (param: string): string => { /* Do custom operations here and return transformed string */ },

    // Custom serializer function for the entire parameter. Allows the user to mimic pre 1.x behaviour.
    serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions ),

    // Configuration for formatting array indexes in the params.
    indexes: false, // Three available options: (1) indexes: null (leads to no brackets), (2) (default) indexes: false (leads to empty brackets), (3) indexes: true (leads to brackets with indexes).

    // Maximum object nesting depth when serializing params. Payloads deeper than this throw an
    // FaxiosError with code ERR_FORM_DATA_DEPTH_EXCEEDED. Default: 100. Set to Infinity to disable.
    maxDepth: 100

  },

  // `data` is the data to be sent as the request body
  // Only applicable for request methods 'PUT', 'POST', 'DELETE', and 'PATCH'
  // When no `transformRequest` is set, it must be of one of the following types:
  // - string, plain object, ArrayBuffer, ArrayBufferView, URLSearchParams
  // - Browser only: FormData, File, Blob
  // - React Native: FormData
  // - Node only: Stream, Buffer, FormData (form-data package)
  data: {
    firstName: 'Fred'
  },

  // `formDataHeaderPolicy` controls how node.js FormData#getHeaders() is copied.
  // 'legacy' (default) copies all returned headers for v1 compatibility.
  // 'content-only' copies only Content-Type and Content-Length.
  formDataHeaderPolicy: 'legacy',

  // syntax alternative to send data into the body
  // method post
  // only the value is sent, not the key
  data: 'Country=Brasil&City=Belo Horizonte',

  // `timeout` specifies the number of milliseconds before the request times out.
  // If the request takes longer than `timeout`, Faxios aborts it.
  timeout: 1000, // default is `0` (no timeout)

  // `withCredentials` indicates whether or not cross-site Access-Control requests
  // should be made using credentials
  // This only controls whether the browser sends credentials.
  // It does not control whether the XSRF header is added.
  withCredentials: false, // default

  // `adapter` allows custom handling of requests which makes testing easier.
  // Return a promise and supply a valid response (see lib/adapters/README.md)
  adapter: function (config) {
    /* ... */
  },
  // Also, you can set the name of the built-in adapter. `'fetch'` is the only
  // built-in adapter and is used in every runtime (browser, Node.js, Deno, Bun).
  adapter: ['fetch'], // default; equivalent to 'fetch'

  // `auth` indicates that HTTP Basic auth should be used, and supplies credentials.
  // This will set an `Authorization` header, overwriting any existing
  // `Authorization` custom headers you have set using `headers`.
  // If `auth` is omitted, the fetch adapter can read
  // HTTP Basic auth credentials from the request URL, for example
  // `https://user:pass@example.com`. Faxios decodes percent-encoded URL
  // credentials, and `auth` takes precedence over URL-embedded credentials.
  // Please note that only HTTP Basic auth is configurable through this parameter.
  // For Bearer tokens and such, use `Authorization` custom headers instead.
  auth: {
    username: 'janedoe',
    password: 's00pers3cret'
  },

  // `responseType` indicates the type of data that the server will respond with
  // options are: 'arraybuffer', 'document', 'json', 'text', 'stream'
  //   browser only: 'blob'
  responseType: 'json', // default

  // `responseEncoding` indicates encoding to use for decoding responses (Node.js only)
  // Note: Ignored for `responseType` of 'stream' or client-side requests
  // options are: 'ascii', 'ASCII', 'ansi', 'ANSI', 'binary', 'BINARY', 'base64', 'BASE64', 'base64url',
  // 'BASE64URL', 'hex', 'HEX', 'latin1', 'LATIN1', 'ucs-2', 'UCS-2', 'ucs2', 'UCS2', 'utf-8', 'UTF-8',
  // 'utf8', 'UTF8', 'utf16le', 'UTF16LE'
  responseEncoding: 'utf8', // default

  // `xsrfCookieName` is the name of the cookie to use as a value for the xsrf token
  xsrfCookieName: 'XSRF-TOKEN', // default

  // `xsrfHeaderName` is the name of the http header that carries the xsrf token value
  xsrfHeaderName: 'X-XSRF-TOKEN', // default

  // `withXSRFToken` defines whether to send the XSRF header in browser requests.
  // `undefined` (default) - set XSRF header only for the same origin requests
  // `true` - always set XSRF header, including for cross-origin requests
  // `false` - never set XSRF header
  // function - resolve with custom logic; receives the internal config object
  withXSRFToken: boolean | undefined | ((config: InternalFaxiosRequestConfig) => boolean | undefined),

  // `withXSRFToken` controls whether Faxios reads the XSRF cookie and sets the XSRF header.
  // - `undefined` (default): the XSRF header is set only for same-origin requests.
  // - `true`: attempt to set the XSRF header for all requests (including cross-origin).
  // - `false`: never set the XSRF header.
  // - function: a callback that receives the request `config` and returns `true`,
  //   `false`, or `undefined` to decide per-request behavior.
  //
  // Note about `withCredentials`: `withCredentials` controls whether cross-site
  // requests include credentials (cookies and HTTP auth). In older Faxios versions,
  // setting `withCredentials: true` implicitly caused Faxios to set the XSRF header
  // for cross-origin requests. Newer Faxios separates these concerns: to allow the
  // XSRF header to be sent for cross-origin requests you should set both
  // `withCredentials: true` and `withXSRFToken: true`.
  //
  // Example:
  // faxios.get('/user', { withCredentials: true, withXSRFToken: true });

  // `onDownloadProgress` allows handling of progress events for downloads.
  // Upload progress (`onUploadProgress`) is not supported because the
  // web-standard fetch API cannot emit upload progress events.
  onDownloadProgress: function ({loaded, total, progress, bytes, estimated, rate, download = true}) {
    // Do whatever you want with the Faxios progress event
  },

  // `maxContentLength` defines the max size of the response content in bytes.
  // It is enforced by the fetch adapter.
  maxContentLength: 2000,

  // `maxBodyLength` defines the max size of the request content in bytes.
  // It is enforced by the fetch adapter when the body length can be determined.
  maxBodyLength: 2000,

  // `redact` masks matching config keys when FaxiosError#toJSON() is called.
  // Matching is case-insensitive and recursive. It does not change the request.
  redact: ['authorization', 'password'],

  // `validateStatus` defines whether to resolve or reject the promise for a given
  // HTTP response status code. If `validateStatus` returns `true` (or is set to `null`
  // or `undefined`), Faxios resolves the promise; otherwise, Faxios rejects it.
  validateStatus: function (status) {
    return status >= 200 && status < 300; // default
  },

  // `cancelToken` specifies a cancel token that can be used to cancel the request
  // (see Cancellation section below for details)
  cancelToken: new CancelToken(function (cancel) {
  }),

  // an alternative way to cancel Faxios requests using AbortController
  signal: new AbortController().signal,

  // transitional options for backward compatibility that may be removed in the newer versions
  transitional: {
    // silent JSON parsing mode
    // `true`  - ignore JSON parsing errors and set response.data to null if parsing failed (old behaviour)
    // `false` - throw SyntaxError if JSON parsing failed
    // Important: this option only takes effect when `responseType` is explicitly set to 'json'.
    // When `responseType` is omitted (defaults to no value), faxios uses `forcedJSONParsing`
    // to attempt JSON parsing, but will silently return the raw string on failure regardless
    // of this setting. To have invalid JSON throw errors, use:
    //   { responseType: 'json', transitional: { silentJSONParsing: false } }
    silentJSONParsing: true, // default value for the current Faxios version

    // try to parse the response string as JSON even if `responseType` is not 'json'
    forcedJSONParsing: true,

    // throw ETIMEDOUT error instead of generic ECONNABORTED on request timeouts
    clarifyTimeoutError: false,

    // advertise `zstd` in the default Accept-Encoding header when the current
    // runtime's fetch implementation can decompress zstd responses.
    advertiseZstdAcceptEncoding: false,

    // use the legacy interceptor request/response ordering
    legacyInterceptorReqResOrdering: true, // default
  },

  env: {
    // The FormData class to be used to automatically serialize the payload into a FormData object
    FormData: window?.FormData || global?.FormData
  },

  formSerializer: {
      visitor: (value, key, path, helpers) => {}; // custom visitor function to serialize form values
      dots: boolean; // use dots instead of brackets format
      metaTokens: boolean; // keep special endings like {} in parameter key
      indexes: boolean; // array indexes format null - no brackets, false - empty brackets, true - brackets with indexes
      maxDepth: 100; // maximum object nesting depth; throws FaxiosError (ERR_FORM_DATA_DEPTH_EXCEEDED) if exceeded. Set to Infinity to disable.
  }
}
```

### Strict RFC 3986 percent-encoding for query params

By default, faxios decodes `%3A`, `%24`, `%2C` and `%20` back to `:`, `$`, `,` and `+` for readability (the `+` follows the `application/x-www-form-urlencoded` convention for spaces in query strings). These characters are valid in a query component under [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986#section-3.4), so the default output is correct, but some backends require strict percent-encoding and reject the readable form.

Override the default encoder via `paramsSerializer.encode`:

```js
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

## Response schema

The response to a request contains the following information.

```js
{
  // `data` is the response that was provided by the server
  data: {},

  // `status` is the HTTP status code from the server response
  status: 200,

  // `statusText` is the HTTP status message from the server response
  statusText: 'OK',

  // `headers` the HTTP headers that the server responded with
  // All header names are lowercase and can be accessed using the bracket notation.
  // Example: `response.headers['content-type']`
  headers: {},

  // `config` is the config that was provided to `faxios` for the request
  config: {},

  // `request` is the request that generated this response
  // It is the fetch `Request` instance used for the request
  request: {}
}
```

When using `then`, you receive the response like this:

```js
const response = await faxios.get('/user/12345');
console.log(response.data);
console.log(response.status);
console.log(response.statusText);
console.log(response.headers);
console.log(response.config);
```

When using `catch`, or passing a [rejection callback](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then) as the second parameter of `then`, read the response from the `error` object. See [Handling errors](#handling-errors).

## Config defaults

Config defaults apply to every request.

### Global faxios defaults

```js
faxios.defaults.baseURL = 'https://api.example.com';

// Important: If you use faxios with multiple domains, Faxios sends AUTH_TOKEN to all of them.
// See below for an example using Custom instance defaults instead.
faxios.defaults.headers.common['Authorization'] = AUTH_TOKEN;

faxios.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
```

### Custom instance defaults

```js
// Set config defaults when creating the instance
const instance = faxios.create({
  baseURL: 'https://api.example.com',
});

// Alter defaults after instance has been created
instance.defaults.headers.common['Authorization'] = AUTH_TOKEN;
```

### Config order of precedence

Faxios merges config in this order: library defaults from [lib/defaults/index.js](https://github.com/faxios/faxios/blob/main/lib/defaults/index.js#L49), the instance `defaults` property, and the request `config` argument. Later values take precedence over earlier ones.

```js
// Create an instance using the config defaults provided by the library
// At this point the timeout config value is `0` as is the default for the library
const instance = faxios.create();

// Override timeout default for the library
// Now all requests using this instance will wait 2.5 seconds before timing out
instance.defaults.timeout = 2500;

// Override timeout for this request as it's known to take a long time
instance.get('/longRequest', {
  timeout: 5000,
});
```

## Interceptors

You can intercept requests or responses before methods like `.get()` or `.post()`
resolve their promises (before code inside `then` or `catch`, or after `await`)

```js
const instance = faxios.create();

// Add a request interceptor
instance.interceptors.request.use(
  function (config) {
    // Do something before the request is sent
    return config;
  },
  function (error) {
    // Do something with the request error
    return Promise.reject(error);
  }
);

// Add a response interceptor
instance.interceptors.response.use(
  function (response) {
    // Any status code that lies within the range of 2xx causes this function to trigger
    // Do something with response data
    return response;
  },
  function (error) {
    // Any status codes that fall outside the range of 2xx cause this function to trigger
    // Do something with response error
    return Promise.reject(error);
  }
);
```

If you need to remove an interceptor later you can.

```js
const instance = faxios.create();
const myInterceptor = instance.interceptors.request.use(function () {
  /*...*/
});
instance.interceptors.request.eject(myInterceptor);
```

You can also clear all interceptors for requests or responses.

```js
const instance = faxios.create();
instance.interceptors.request.use(function () {
  /*...*/
});
instance.interceptors.request.clear(); // Removes interceptors from requests
instance.interceptors.response.use(function () {
  /*...*/
});
instance.interceptors.response.clear(); // Removes interceptors from responses
```

You can add interceptors to a custom instance of faxios.

```js
const instance = faxios.create();
instance.interceptors.request.use(function () {
  /*...*/
});
```

When you add request interceptors, they are presumed to be asynchronous by default. This can cause a delay
in the execution of your faxios request when the main thread is blocked (a promise is created under the hood for
the interceptor and your request gets put at the bottom of the call stack). If your request interceptors are synchronous you can add a flag
to the options object that will tell faxios to run the code synchronously and avoid any delays in request execution.

```js
faxios.interceptors.request.use(
  function (config) {
    config.headers.test = 'I am only a header!';
    return config;
  },
  null,
  { synchronous: true }
);
```

If you want to execute a particular interceptor based on a runtime check,
you can add a `runWhen` function to the options object. The request interceptor will not run **if and only if** the return
of `runWhen` is `false`. Faxios calls the function with the config
object (don't forget that you can bind your own arguments to it as well.) This can be handy when you have an
asynchronous request interceptor that only needs to run at certain times.

```js
function onGetCall(config) {
  return config.method === 'get';
}
faxios.interceptors.request.use(
  function (config) {
    config.headers.test = 'special get headers';
    return config;
  },
  null,
  { runWhen: onGetCall }
);
```

> Note: The options parameter (with `synchronous` and `runWhen` properties) is only supported for request interceptors at the moment.

### Interceptor execution order

Request and response interceptors use different execution orders.

Request interceptors run in reverse order (LIFO: last in, first out). The last interceptor added runs first.

Response interceptors run in the order they were added (FIFO: first in, first out). The first interceptor added runs first.

Example:

```js
const instance = faxios.create();

const interceptor = (id) => (base) => {
  console.log(id);
  return base;
};

instance.interceptors.request.use(interceptor('Request Interceptor 1'));
instance.interceptors.request.use(interceptor('Request Interceptor 2'));
instance.interceptors.request.use(interceptor('Request Interceptor 3'));
instance.interceptors.response.use(interceptor('Response Interceptor 1'));
instance.interceptors.response.use(interceptor('Response Interceptor 2'));
instance.interceptors.response.use(interceptor('Response Interceptor 3'));

// Console output:
// Request Interceptor 3
// Request Interceptor 2
// Request Interceptor 1
// [HTTP request is made]
// Response Interceptor 1
// Response Interceptor 2
// Response Interceptor 3
```

### Multiple interceptors

When a response is fulfilled and multiple response interceptors are registered:

- Each interceptor runs in registration order.
- Each interceptor receives the result from the previous interceptor.
- The chain returns the result from the last interceptor.
- If a fulfillment interceptor throws, Faxios skips the next fulfillment interceptor and calls the next rejection interceptor.
- After the error is caught, later fulfillment interceptors run again, just like in a promise chain.

Read [the interceptor tests](./test/specs/interceptors.spec.js) to see all this in code.

## Error types

Faxios error messages include details that can help you debug the request.

Faxios errors use this structure:
| Property | Definition |
| -------- | ---------- |
| message | A quick summary of the error message and the status it failed with. |
| name | This defines where the error originated from. For faxios, it will always be an 'FaxiosError'. |
| stack | Stack trace for the error. |
| config | An faxios config object with specific instance configurations defined by the user from when the request was made |
| code | Faxios error code. The table below lists internal Faxios error codes. |
| status | HTTP response status code. See [here](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes) for common HTTP response status code meanings.

These are the internal Faxios error codes:

| Code                      | Definition                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ERR_BAD_OPTION_VALUE      | Invalid value provided in faxios configuration.                                                                                                                                                                                                                                                                                                                                                 |
| ERR_BAD_OPTION            | Invalid option provided in faxios configuration.                                                                                                                                                                                                                                                                                                                                                |
| ERR_NOT_SUPPORT           | Feature or method not supported in the current faxios environment.                                                                                                                                                                                                                                                                                                                              |
| ERR_DEPRECATED            | Deprecated feature or method used in faxios.                                                                                                                                                                                                                                                                                                                                                    |
| ERR_INVALID_URL           | Invalid URL provided for faxios request.                                                                                                                                                                                                                                                                                                                                                        |
| ECONNABORTED              | Typically indicates that the request has been timed out (unless `transitional.clarifyTimeoutError` is set) or aborted by the browser or its plugin.                                                                                                                                                                                                                                            |
| ERR_CANCELED              | The user explicitly canceled the request with an AbortSignal or CancelToken.                                                                                                                                                                                                                                                                                                                   |
| ETIMEDOUT                 | Request timed out after exceeding the configured Faxios timeout. Set `transitional.clarifyTimeoutError` to `true`; otherwise Faxios throws a generic `ECONNABORTED` error.                                                                                                                                                                                                                        |
| ERR_NETWORK               | Network-related issue. In the browser, this error can also be caused by a [CORS](https://developer.mozilla.org/ru/docs/Web/HTTP/Guides/CORS) or [Mixed Content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content) policy violation. The browser does not allow the JS code to clarify the real reason for the error caused by security issues, so please check the console. |
| ERR_FR_TOO_MANY_REDIRECTS | Request exceeded the configured maximum number of redirects.                                                                                                                                                                                                                                                                                                                                   |
| ERR_BAD_RESPONSE          | Response cannot be parsed properly or is in an unexpected format. Usually related to a response with `5xx` status code.                                                                                                                                                                                                                                                                        |
| ERR_BAD_REQUEST           | The request has an unexpected format or is missing required parameters. Usually related to a response with `4xx` status code.                                                                                                                                                                                                                                                                  |

## Handling errors

By default, Faxios rejects responses with status codes outside the 2xx range.

```js
faxios.get('/user/12345').catch(function (error) {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  } else if (error.request) {
    // The request was made but no response was received
    // `error.request` is the fetch `Request` instance used for the request
    console.log(error.request);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.log('Error', error.message);
  }
  console.log(error.config);
});
```

Use `validateStatus` to override the default condition (`status >= 200 && status < 300`) and choose which HTTP status codes should reject.

```js
faxios.get('/user/12345', {
  validateStatus: function (status) {
    return status < 500; // Resolve only if the status code is less than 500
  },
});
```

Use `toJSON` to get more information about the HTTP error.

```js
faxios.get('/user/12345').catch(function (error) {
  console.log(error.toJSON());
});
```

To avoid logging secrets from `error.config`, pass a `redact` array in the request config. Matching config keys are masked case-insensitively at any depth when `FaxiosError#toJSON()` is called.

```js
faxios.get('/user/12345', {
  headers: { Authorization: 'Bearer token' },
  redact: ['authorization']
}).catch(function (error) {
  console.log(error.toJSON().config.headers.Authorization); // [REDACTED ****]
});
```

## Handling timeouts

```js
async function fetchWithTimeout() {
  try {
    const response = await faxios.get('https://example.com/data', {
      timeout: 5000, // 5 seconds
      transitional: {
        // set to true if you prefer ETIMEDOUT over ECONNABORTED
        clarifyTimeoutError: false,
      },
    });

    console.log('Response:', response.data);
  } catch (error) {
    if (faxios.isFaxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        console.error('Request timed out. Please try again.');
        return;
      }

      console.error('Faxios error:', error.message);
      return;
    }

    console.error('Unexpected error:', error);
  }
}
```

## Cancellation

### AbortController

Since `v0.22.0`, Faxios supports AbortController:

```js
const controller = new AbortController();

faxios
  .get('/foo/bar', {
    signal: controller.signal,
  })
  .then(function (response) {
    //...
  });
// cancel the request
controller.abort();
```

### CancelToken (deprecated)

You can also cancel a request using a _CancelToken_.

> The faxios cancel token API is based on the withdrawn [cancellable promises proposal](https://github.com/tc39/proposal-cancelable-promises).

> This API is deprecated since v0.22.0 and should not be used in new projects.

Create a cancel token with the `CancelToken.source` factory:

```js
const CancelToken = faxios.CancelToken;
const source = CancelToken.source();

faxios
  .get('/user/12345', {
    cancelToken: source.token,
  })
  .catch(function (thrown) {
    if (faxios.isCancel(thrown)) {
      console.log('Request canceled', thrown.message);
    } else {
      // handle error
    }
  });

faxios.post(
  '/user/12345',
  {
    name: 'new name',
  },
  {
    cancelToken: source.token,
  }
);

// cancel the request (the message parameter is optional)
source.cancel('Operation canceled by the user.');
```

You can also pass an executor function to the `CancelToken` constructor:

```js
const CancelToken = faxios.CancelToken;
let cancel;

faxios.get('/user/12345', {
  cancelToken: new CancelToken(function executor(c) {
    // An executor function receives a cancel function as a parameter
    cancel = c;
  }),
});

// cancel the request
cancel();
```

> Note: You can cancel several requests with the same cancel token or abort controller.
> If a cancellation token is already cancelled when an Faxios request starts, Faxios cancels the request immediately without making a real request.

> During the transition period, you can use both cancellation APIs, even for the same request:

## Using `application/x-www-form-urlencoded` format

### URLSearchParams

By default, faxios serializes JavaScript objects to `JSON`. To send data as [`application/x-www-form-urlencoded`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/POST), use the [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) API. It works in most browsers and in [Node](https://nodejs.org/api/url.html#url_class_urlsearchparams) v10 and later.

```js
const params = new URLSearchParams({ foo: 'bar' });
params.append('extraparam', 'value');
faxios.post('/foo', params);
```

### Query string (older browsers)

For very old browsers, use a [polyfill](https://github.com/WebReflection/url-search-params) and make sure it patches the global environment.

Alternatively, you can encode data using the [`qs`](https://github.com/ljharb/qs) library:

```js
const qs = require('qs');
faxios.post('/foo', qs.stringify({ bar: 123 }));
```

With ES modules:

```js
import qs from 'qs';
const data = { bar: 123 };
const options = {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  data: qs.stringify(data),
  url,
};
faxios(options);
```

### Older Node.js versions

For older Node.js engines, use the [`querystring`](https://nodejs.org/api/querystring.html) module:

```js
const querystring = require('querystring');
faxios.post('https://something.com/', querystring.stringify({ foo: 'bar' }));
```

You can also use the [`qs`](https://github.com/ljharb/qs) library.

> Note: The `qs` library is preferable if you need to stringify nested objects, as the `querystring` method has [known issues](https://github.com/nodejs/node-v0.x-archive/issues/1665) with that use case.

### Automatic serialization to URLSearchParams

Faxios automatically serializes the data object to urlencoded format if the content-type header is set to "application/x-www-form-urlencoded".

```js
const data = {
  x: 1,
  arr: [1, 2, 3],
  arr2: [1, [2], 3],
  users: [
    { name: 'Peter', surname: 'Griffin' },
    { name: 'Thomas', surname: 'Anderson' },
  ],
};

await faxios.postForm('https://postman-echo.com/post', data, {
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
});
```

The server receives these fields:

```js
  {
    x: '1',
    'arr[]': [ '1', '2', '3' ],
    'arr2[0]': '1',
    'arr2[1][0]': '2',
    'arr2[2]': '3',
    'arr3[]': [ '1', '2', '3' ],
    'users[0][name]': 'Peter',
    'users[0][surname]': 'griffin',
    'users[1][name]': 'Thomas',
    'users[1][surname]': 'Anderson'
  }
```

If your backend body parser, such as `body-parser` for `express.js`, supports nested object decoding, the server receives the same object structure:

```js
const app = express();

app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.post('/', function (req, res, next) {
  // echo body as JSON
  res.send(JSON.stringify(req.body));
});

server = app.listen(3000);
```

## Using `multipart/form-data` format

### FormData

To send data as `multipart/form-data`, pass a FormData instance as the payload.
You do not need to set the `Content-Type` header. Faxios detects it from the payload type.
For browser, web worker, and React Native `FormData`, leave `Content-Type` unset so the runtime can add the multipart boundary.

```js
const formData = new FormData();
formData.append('foo', 'bar');

faxios.post('https://httpbin.org/post', formData);
```

In node.js, use the [`form-data`](https://github.com/form-data/form-data) library:

```js
const FormData = require('form-data');

const form = new FormData();
form.append('my_field', 'my value');
form.append('my_buffer', Buffer.alloc(10));
form.append('my_file', fs.createReadStream('/foo/bar.jpg'));

faxios.post('https://example.com', form);
```

In node.js, when a `FormData` object provides `getHeaders()`, faxios copies all returned headers by default for v1 compatibility. If the `FormData` object is custom or not fully trusted, set `formDataHeaderPolicy: 'content-only'` to copy only `Content-Type` and `Content-Length`, and set any other request headers explicitly with the request `headers` config.

### Automatic serialization to FormData

Since `v0.27.0`, Faxios can serialize an object to FormData if the request `Content-Type`
header is set to `multipart/form-data`.

This request submits data as FormData in browsers and Node.js:

```js
import faxios from '@gcmdev/faxios';

faxios
  .post(
    'https://httpbin.org/post',
    { x: 1 },
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
  .then(({ data }) => console.log(data));
```

The Node.js build uses the [`form-data`](https://github.com/form-data/form-data) polyfill by default.

You can override the FormData class with the `env.FormData` config option, but most applications do not need this:

```js
import faxios from '@gcmdev/faxios';

const { data } = await faxios.post(
  'https://httpbin.org/post',
  { x: 1, buf: Buffer.alloc(10) },
  { headers: { 'Content-Type': 'multipart/form-data' } }
);
console.log(data);
```

The Faxios FormData serializer supports these special endings:

- `{}` - serialize the value with JSON.stringify
- `[]` - unwrap the array-like object as separate fields with the same key

> Note: Arrays and FileList objects are unwrapped by default.

FormData serializer supports additional options via `config.formSerializer: object` property to handle rare cases:

- `visitor: Function` - user-defined visitor function that Faxios calls recursively to serialize the data object
  to a `FormData` object by following custom rules.

- `dots: boolean = false` - use dot notation instead of brackets to serialize arrays and objects;

- `metaTokens: boolean = true` - add the special ending (e.g `user{}: '{"name": "John"}'`) in the FormData key.
  A backend body parser can use this meta-information to parse the value as JSON.

- `indexes: null|false|true = false` - controls how Faxios adds indexes to unwrapped keys of `flat` array-like objects.
  - `null` - don't add brackets (`arr: 1`, `arr: 2`, `arr: 3`)
  - `false`(default) - add empty brackets (`arr[]: 1`, `arr[]: 2`, `arr[]: 3`)
  - `true` - add brackets with indexes (`arr[0]: 1`, `arr[1]: 2`, `arr[2]: 3`)
- `maxDepth: number = 100` - maximum object nesting depth the serializer will recurse into. If the
  input object exceeds this depth, an `FaxiosError` with `code: 'ERR_FORM_DATA_DEPTH_EXCEEDED'` is
  thrown instead of overflowing the call stack. This protects server applications from DoS
  attacks via deeply nested payloads. Set to `Infinity` to disable the limit and restore pre-fix behaviour.

```js
// Raise the limit for a schema that genuinely nests deeper than 100 levels:
faxios.postForm('/api', data, { formSerializer: { maxDepth: 200 } });

// Same protection applies to params serialization:
faxios.get('/api', { params: data, paramsSerializer: { maxDepth: 200 } });
```

Given this object:

```js
const obj = {
  x: 1,
  arr: [1, 2, 3],
  arr2: [1, [2], 3],
  users: [
    { name: 'Peter', surname: 'Griffin' },
    { name: 'Thomas', surname: 'Anderson' },
  ],
  'obj2{}': [{ x: 1 }],
};
```

The Faxios serializer appends these fields:

```js
const formData = new FormData();
formData.append('x', '1');
formData.append('arr[]', '1');
formData.append('arr[]', '2');
formData.append('arr[]', '3');
formData.append('arr2[0]', '1');
formData.append('arr2[1][0]', '2');
formData.append('arr2[2]', '3');
formData.append('users[0][name]', 'Peter');
formData.append('users[0][surname]', 'Griffin');
formData.append('users[1][name]', 'Thomas');
formData.append('users[1][surname]', 'Anderson');
formData.append('obj2{}', '[{"x":1}]');
```

Faxios supports `postForm`, `putForm`, and `patchForm` as shortcuts for the matching HTTP methods with the `Content-Type` header preset to `multipart/form-data`.

## Posting files

Submit a single file:

```js
await faxios.postForm('https://httpbin.org/post', {
  myVar: 'foo',
  file: document.querySelector('#fileInput').files[0],
});
```

or multiple files as `multipart/form-data`:

```js
await faxios.postForm('https://httpbin.org/post', {
  'files[]': document.querySelector('#fileInput').files,
});
```

`FileList` object can be passed directly:

```js
await faxios.postForm('https://httpbin.org/post', document.querySelector('#fileInput').files);
```

Faxios sends all files with the same field name: `files[]`.

## HTML form posting (browser)

Pass an HTML Form element as a payload to submit it as `multipart/form-data` content.

```js
await faxios.postForm('https://httpbin.org/post', document.querySelector('#htmlForm'));
```

`FormData` and `HTMLForm` objects can also be posted as `JSON` by explicitly setting the `Content-Type` header to `application/json`:

```js
await faxios.post('https://httpbin.org/post', document.querySelector('#htmlForm'), {
  headers: {
    'Content-Type': 'application/json',
  },
});
```

For example, the Form

```html
<form id="form">
  <input type="text" name="foo" value="1" />
  <input type="text" name="deep.prop" value="2" />
  <input type="text" name="deep prop spaced" value="3" />
  <input type="text" name="baz" value="4" />
  <input type="text" name="baz" value="5" />

  <select name="user.age">
    <option value="value1">Value 1</option>
    <option value="value2" selected>Value 2</option>
    <option value="value3">Value 3</option>
  </select>

  <input type="submit" value="Save" />
</form>
```

submits this JSON object:

```js
{
  "foo": "1",
  "deep": {
    "prop": {
      "spaced": "3"
    }
  },
  "baz": [
    "4",
    "5"
  ],
  "user": {
    "age": "value2"
  }
}
```

Sending `Blobs`/`Files` as JSON (`base64`) is not currently supported.

## Progress capturing

Faxios can capture response download progress in every runtime.
Progress events are limited to `3` times per second.

Upload progress (`onUploadProgress`) is not supported because the web-standard
fetch API cannot emit upload progress events.

```js
await faxios.post(url, data, {
  onDownloadProgress: function (faxiosProgressEvent) {
    /*{
      loaded: number;
      total?: number;
      progress?: number;
      bytes: number;
      estimated?: number;
      rate?: number; // download speed in bytes
      download: true; // download sign
    }*/
  },
});
```

## FaxiosHeaders

Faxios includes an `FaxiosHeaders` class for working with headers through a Map-like API.
HTTP header names are case-insensitive, but Faxios keeps the original header case for style and for servers that incorrectly depend on case.
Directly manipulating the headers object still works, but it is deprecated.

### Working with headers

An `FaxiosHeaders` instance can contain several internal value types that control setting and merging.
Faxios gets the final headers object with string values by calling `toJSON`.

> Note: By JSON here we mean an object consisting only of string values intended to be sent over the network.

The header value can be one of the following types:

- `string` - normal string value sent to the server
- `null` - skip header when rendering to JSON
- `false` - skip header when rendering to JSON. Also indicates that the `set` method must be called with `rewrite` set to `true`
  to overwrite this value (Faxios uses this internally to allow users to opt out of installing certain headers like `User-Agent` or `Content-Type`)
- `undefined` - value is not set

> Note: The header value is considered set if it is not equal to undefined.

The headers object is always initialized inside interceptors and transformers:

```ts
faxios.interceptors.request.use((request: InternalFaxiosRequestConfig) => {
  request.headers.set('My-header', 'value');

  request.headers.set({
    'My-set-header1': 'my-set-value1',
    'My-set-header2': 'my-set-value2',
  });

  request.headers.set('User-Agent', false); // prevent Faxios from setting this header later

  request.headers.setContentType('text/plain');

  request.headers['My-set-header2'] = 'newValue'; // direct access is deprecated

  return request;
});
```

You can iterate over an `FaxiosHeaders` instance using a `for...of` statement:

```js
const headers = new FaxiosHeaders({
  foo: '1',
  bar: '2',
  baz: '3',
});

for (const [header, value] of headers) {
  console.log(header, value);
}

// foo 1
// bar 2
// baz 3
```

### Preserving a specific header case

Header names are case-insensitive, but `FaxiosHeaders` keeps the case of the first matching key it sees.
If you need a specific case for non-standard case-sensitive servers, define a case preset with `undefined` and then set the value later:

```js
const api = faxios.create();

api.defaults.headers.common = {
  'content-type': undefined,
  accept: undefined,
};

await api.put(url, data, {
  headers: {
    'Content-Type': 'application/octet-stream',
    Accept: 'application/json',
  },
});
```

You can also compose the same behavior with `FaxiosHeaders.concat`:

```js
const headers = faxios.FaxiosHeaders.concat(
  { 'content-type': undefined },
  { 'Content-Type': 'application/octet-stream' }
);

await faxios.put(url, data, { headers });
```

### new FaxiosHeaders(headers?)

Constructs a new `FaxiosHeaders` instance.

```
constructor(headers?: RawFaxiosHeaders | FaxiosHeaders | string);
```

If the headers object is a string, Faxios parses it as raw HTTP headers.

```js
const headers = new FaxiosHeaders(`
Host: www.bing.com
User-Agent: curl/7.54.0
Accept: */*`);

console.log(headers);

// Object [FaxiosHeaders] {
//   host: 'www.bing.com',
//   'user-agent': 'curl/7.54.0',
//   accept: '*/*'
// }
```

### FaxiosHeaders#set

```ts
set(headerName, value: Faxios, rewrite?: boolean);
set(headerName, value, rewrite?: (this: FaxiosHeaders, value: string, name: string, headers: RawFaxiosHeaders) => boolean);
set(headers?: RawFaxiosHeaders | FaxiosHeaders | string, rewrite?: boolean);
```

The `rewrite` argument controls the overwriting behavior:

- `false` - do not overwrite if the header's value is set (is not `undefined`)
- `undefined` (default) - overwrite the header unless its value is set to `false`
- `true` - rewrite anyway

The option can also accept a user-defined function that determines whether to overwrite the value.

Empty or whitespace-only header names are ignored.

Returns `this`.

### FaxiosHeaders#get(header)

```
  get(headerName: string, matcher?: true | FaxiosHeaderMatcher): FaxiosHeaderValue;
  get(headerName: string, parser: RegExp): RegExpExecArray | null;
```

Returns the internal value of the header. It can take an extra argument to parse the header's value with `RegExp.exec`,
matcher function or internal key-value parser.

```ts
const headers = new FaxiosHeaders({
  'Content-Type': 'multipart/form-data; boundary=Asrf456BGe4h',
});

console.log(headers.get('Content-Type'));
// multipart/form-data; boundary=Asrf456BGe4h

console.log(headers.get('Content-Type', true)); // parse key-value pairs from a string separated with \s,;= delimiters:
// [Object: null prototype] {
//   'multipart/form-data': undefined,
//    boundary: 'Asrf456BGe4h'
// }

console.log(
  headers.get('Content-Type', (value, name, headers) => {
    return String(value).replace(/a/g, 'ZZZ');
  })
);
// multipZZZrt/form-dZZZtZZZ; boundZZZry=Asrf456BGe4h

console.log(headers.get('Content-Type', /boundary=(\w+)/)?.[0]);
// boundary=Asrf456BGe4h
```

Returns the value of the header.

### FaxiosHeaders#has(header, matcher?)

```
has(header: string, matcher?: FaxiosHeaderMatcher): boolean;
```

Returns `true` if the header is set (has no `undefined` value).

### FaxiosHeaders#delete(header, matcher?)

```
delete(header: string | string[], matcher?: FaxiosHeaderMatcher): boolean;
```

Returns `true` if at least one header has been removed.

### FaxiosHeaders#clear(matcher?)

```
clear(matcher?: FaxiosHeaderMatcher): boolean;
```

Removes all headers.
Unlike the `delete` method matcher, this optional matcher matches the header name rather than the value.

```ts
const headers = new FaxiosHeaders({
  foo: '1',
  'x-foo': '2',
  'x-bar': '3',
});

console.log(headers.clear(/^x-/)); // true

console.log(headers.toJSON()); // [Object: null prototype] { foo: '1' }
```

Returns `true` if at least one header has been cleared.

### FaxiosHeaders#normalize(format);

If the headers object was changed directly, it can have duplicates with the same name but in different cases.
This method normalizes the headers object by combining duplicate keys into one.
Faxios uses this method internally after calling each interceptor.
Set `format` to true for converting header names to lowercase and capitalizing the initial letters (`cOntEnt-type` => `Content-Type`)

```js
const headers = new FaxiosHeaders({
  foo: '1',
});

headers.Foo = '2';
headers.FOO = '3';

console.log(headers.toJSON()); // [Object: null prototype] { foo: '1', Foo: '2', FOO: '3' }
console.log(headers.normalize().toJSON()); // [Object: null prototype] { foo: '3' }
console.log(headers.normalize(true).toJSON()); // [Object: null prototype] { Foo: '3' }
```

Returns `this`.

### FaxiosHeaders#concat(...targets)

```
concat(...targets: Array<FaxiosHeaders | RawFaxiosHeaders | string | undefined | null>): FaxiosHeaders;
```

Merges the instance with targets into a new `FaxiosHeaders` instance. If the target is a string, Faxios parses it as raw HTTP headers.

Returns a new `FaxiosHeaders` instance.

### FaxiosHeaders#toJSON(asStrings?)

```
toJSON(asStrings: true): Record<string, string>;
toJSON(asStrings?: false): Record<string, string | string[]>;
```

Resolves all internal header values into a new null prototype object.
Set `asStrings` to true to resolve arrays as a string containing all elements, separated by commas.

### FaxiosHeaders.from(thing?)

```
from(thing?: FaxiosHeaders | RawFaxiosHeaders | string): FaxiosHeaders;
```

Returns a new `FaxiosHeaders` instance created from the raw headers passed in,
or returns the given headers object if it's already an `FaxiosHeaders` instance.

### FaxiosHeaders.concat(...targets)

```
concat(...targets: Array<FaxiosHeaders | RawFaxiosHeaders | string | undefined | null>): FaxiosHeaders;
```

Returns a new `FaxiosHeaders` instance created by merging the target objects.

### Shortcuts

The following shortcuts are available:

- `setContentType`, `getContentType`, `hasContentType`

- `setContentLength`, `getContentLength`, `hasContentLength`

- `setAccept`, `getAccept`, `hasAccept`

- `setUserAgent`, `getUserAgent`, `hasUserAgent`

- `setContentEncoding`, `getContentEncoding`, `hasContentEncoding`

## Fetch adapter

The fetch adapter is the only adapter. It uses the web-standard [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API and is used in every runtime — browser, Node.js 18+, Deno, and Bun. It is the default; you do not need to select it.

```js
const { data } = await faxios.get(url); // uses fetch in all runtimes
```

The default `adapter` is `['fetch']`. You can pass a custom adapter function, but `'fetch'` is the only built-in name.

It supports download progress capturing and response types such as `stream` and `formdata` when the environment supports them. Upload progress is not supported because fetch cannot emit upload progress events.

Proxies and connection agents are not configured through faxios options. Configure them at the runtime level instead — for example, by passing a custom dispatcher/agent via `fetchOptions`, or by setting the runtime's global proxy/dispatcher (Node's `undici` `ProxyAgent`, Deno/Bun proxy env vars, etc.).

When `auth` is omitted, the fetch adapter can read HTTP Basic auth credentials from the request URL, for example `https://user:pass@example.com`. Percent-encoded URL credentials are decoded before the `Authorization` header is generated, and `auth` takes precedence over URL-embedded credentials.

### Custom fetch

Since `v1.12.0`, you can configure the fetch adapter to use a custom fetch API instead of environment globals.
Pass a custom `fetch` function, `Request`, and `Response` constructors through `env` config.
This helps in custom environments and app frameworks.

When using a custom fetch, you may also need to set custom `Request` and `Response` constructors. If you do not set them, Faxios uses the global objects.
If your custom fetch API does not provide these objects and the globals are incompatible with it, pass `null` to disable them inside the fetch adapter.

> Note: Setting `Request` and `Response` to `null` prevents the fetch adapter from capturing download progress.

Basic example:

```js
import customFetchFunction from 'customFetchModule';

const instance = faxios.create({
  adapter: 'fetch',
  onDownloadProgress(e) {
    console.log('downloadProgress', e);
  },
  env: {
    fetch: customFetchFunction,
    Request: null, // undefined -> use the global constructor
    Response: null,
  },
});
```

#### Using with Tauri

A minimal example of setting up Faxios for use in a [Tauri](https://tauri.app/plugin/http-client/) app with a platform fetch function that ignores CORS policy for requests.

```js
import { fetch } from '@tauri-apps/plugin-http';
import faxios from '@gcmdev/faxios';

const instance = faxios.create({
  adapter: 'fetch',
  onDownloadProgress(e) {
    console.log('downloadProgress', e);
  },
  env: {
    fetch,
  },
});

const { data } = await instance.get('https://google.com');
```

#### Using with SvelteKit

[SvelteKit](https://svelte.dev/docs/kit/web-standards#Fetch-APIs) uses a custom fetch function for server rendering in `load` functions. It also uses relative paths, which are incompatible with the standard URL API. Configure Faxios to use SvelteKit's custom fetch API:

```js
export async function load({ fetch }) {
  const { data: post } = await faxios.get('https://jsonplaceholder.typicode.com/posts/1', {
    adapter: 'fetch',
    env: {
      fetch,
      Request: null,
      Response: null,
    },
  });

  return { post };
}
```

## Semver

Faxios follows [semver](https://semver.org/) since `v1.0.0`.

## Promises

faxios depends on a native ES6 Promise implementation to be [supported](https://caniuse.com/promises).
If your environment doesn't support ES6 Promises, you can [polyfill](https://github.com/jakearchibald/es6-promise).

## TypeScript

faxios includes [TypeScript](https://typescriptlang.org) definitions and a type guard for faxios errors.

```typescript
let user: User = null;
try {
  const { data } = await faxios.get('/user?ID=12345');
  user = data.userDetails;
} catch (error) {
  if (faxios.isFaxiosError(error)) {
    handleFaxiosError(error);
  } else {
    handleUnexpectedError(error);
  }
}
```

Use `faxios.isCancel<T>()` to narrow cancellation errors to `CanceledError<T>`:

```typescript
const controller = new AbortController();

try {
  await faxios.get<User>('/user?ID=12345', { signal: controller.signal });
} catch (error) {
  if (faxios.isCancel<User>(error)) {
    handleCancellation(error);
  }
}
```

Because faxios publishes an ESM default export and a CJS `module.exports`, TypeScript has a few caveats.
The recommended setting is `"moduleResolution": "node16"`, which is implied by `"module": "node16"`. This requires TypeScript 4.7 or greater.
If you use ESM, your settings should be fine.
If you compile TypeScript to CJS and can't use `"moduleResolution": "node 16"`, enable `esModuleInterop`.
If you use TypeScript to type check CJS JavaScript code, your only option is to use `"moduleResolution": "node16"`.

You can also create a custom instance with typed interceptors:

```typescript
import faxios, { FaxiosInstance, InternalFaxiosRequestConfig } from '@gcmdev/faxios';

const apiClient: FaxiosInstance = faxios.create({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

apiClient.interceptors.request.use((config: InternalFaxiosRequestConfig) => {
  // Add auth token
  return config;
});
```

## Online one-click setup

You can use Gitpod, a free online IDE for open source projects, to contribute or run the examples online.

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/faxios/faxios/blob/main/examples/server.js)

## Contributing

### Local setup

As a supply-chain hardening measure, this repository ships a project-level `.npmrc` that sets `ignore-scripts=true`. This blocks npm lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`) from any direct or transitive dependency when you run `npm install` or `npm ci` inside the repo. See [THREATMODEL.md](./THREATMODEL.md) (threat T-S2) for the rationale.

One consequence: the repository's own `prepare` hook (which installs Husky's git hooks) will **not** run automatically. After your first install, enable the git hooks manually:

```bash
npm ci
npm rebuild husky && npx husky
```

Run those two commands once per fresh checkout. You do **not** need to re-run them after every subsequent `npm install`.

Do not remove `ignore-scripts=true` from `.npmrc` to "fix" this. That reopens the lifecycle-script attack surface for every other package in the tree. All CI workflows already invoke npm with `--ignore-scripts`, so local behaviour matches CI.

## Resources

- [Changelog](https://github.com/faxios/faxios/blob/v1.x/CHANGELOG.md)
- [Ecosystem](https://github.com/faxios/faxios/blob/v1.x/ECOSYSTEM.md)
- [Contributing Guide](https://github.com/faxios/faxios/blob/v1.x/CONTRIBUTING.md)
- [Code of Conduct](https://github.com/faxios/faxios/blob/v1.x/CODE_OF_CONDUCT.md)

## Credits

faxios is heavily inspired by the [$http service](https://docs.angularjs.org/api/ng/service/$http) in [AngularJS](https://angularjs.org/). It provides a standalone `$http`-like service for use outside AngularJS.

## License

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
