# Features

faxios is a TypeScript-first, promise-based HTTP client built on the web-standard `fetch` API. It runs in browsers, Node.js, Deno and Bun with the same API. Here is what it offers.

## Isomorphic

faxios is a universal HTTP client that can be used in the browser, Node.js, Deno and Bun. This means you can use faxios to make API requests from your frontend code as well as your backend code. This makes faxios a great choice for building progressive web apps, single-page applications, and server-side rendered applications.

faxios is also a great choice for teams that work on both frontend and backend code. By using faxios for both frontend and backend code, you can have a consistent API for making HTTP requests, which can help reduce the complexity of your codebase.

## Fetch support <Badge type="tip" text="New" />

faxios is built entirely on the web-standard Fetch API, which is its sole HTTP transport across all supported environments (browsers, Node.js 24+, Deno, and Bun). No configuration is required, and there is no adapter to select.

## Browser support

faxios supports the latest versions of Chrome, Firefox, Safari, Opera, and Edge. The browser test suite runs on Chromium, Firefox, and WebKit.

## Node.js support

faxios requires Node.js 24 or later, and uses the `fetch` built into Node.js.

In addition to Node.js, faxios has Bun and Deno smoke tests that validate key runtime behavior and improve confidence in cross-runtime compatibility.

## Additional features

- Supports the Promise API
- [Middleware](/pages/advanced/middleware) around every request, with built-in [`authBearer`](/pages/plugins/auth-bearer), [`forwardTo`](/pages/plugins/forward-to), [`retry`](/pages/plugins/retry) and [`timing`](/pages/plugins/timing) plugins
- Transform request and response data
- Abort controller
- Timeouts
- Query parameters serialization with support for nested entries
- Automatic request body serialization to:
  - JSON (application/json)
  - Multipart / FormData (multipart/form-data)
  - URL encoded form (application/x-www-form-urlencoded)
- Posting HTML forms as JSON
- Automatic JSON data handling in response
- Download progress in every runtime and upload progress in Node.js, with extra info (speed rate, remaining time)
- Compatible with spec-compliant FormData and Blob (including Node.js, Deno and Bun)
- Client side support for protecting against XSRF
