# faxios

> Promise based HTTP client for the browser and Node.js — a TypeScript-first fork of [axios](https://github.com/axios/axios).

[![npm version](https://img.shields.io/npm/v/@gcmdev/faxios.svg?style=flat-square)](https://www.npmjs.org/package/@gcmdev/faxios)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/adrianbrowning/faxios/blob/main/LICENSE)

## Features

- Uses the web-standard [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API in every runtime: browser, Node.js, Deno, and Bun.
- Promise API with onion-style [`.use()` middleware](https://adrianbrowning.github.io/faxios/pages/advanced/middleware) and built-in plugins for [retries](https://adrianbrowning.github.io/faxios/pages/advanced/retry), [bearer auth](https://adrianbrowning.github.io/faxios/pages/advanced/authentication) and timing.
- Request and response data transforms, with automatic JSON handling.
- Serializes objects to `multipart/form-data` or `application/x-www-form-urlencoded`.
- Cancellation with `AbortSignal`.
- Request and response validation with any Standard Schema v1 library (Zod, Valibot, ArkType). A failed `responseSchema` keeps the rejected body on `error.response.data`.
- Strictly typed request `headers`, with suggestions for common header names and `Content-Type` values.
- Typed endpoint builders: `faxios.define()` and `faxios.route()`.
- Client-side protection against Cross-Site Request Forgery.
- ESM-only, with TypeScript definitions included.

## Installing

```bash
npm install @gcmdev/faxios
```

```bash
pnpm add @gcmdev/faxios
```

## Example

```js
import faxios from "@gcmdev/faxios";

const { data: user } = await faxios.get("/user", {
  params: { ID: 12345 },
  timeout: 5000,
});

const response = await faxios.post("/user", {
  firstName: "Fred",
  lastName: "Flintstone",
});
```

Add behaviour to every request with `.use()`. Keep the instance it returns: only that value is typed with the plugin's options.

```js
import faxios from "@gcmdev/faxios";
import { retry } from "@gcmdev/faxios/plugins/retry";

const api = faxios.create().use(retry());

const { data } = await api.get("/user", { headers: { Accept: "application/json" } });
```

## Documentation

The full documentation is at https://adrianbrowning.github.io/faxios/.

- [First steps](https://adrianbrowning.github.io/faxios/pages/getting-started/first-steps)
- [Request config](https://adrianbrowning.github.io/faxios/pages/advanced/request-config)
- [Error handling](https://adrianbrowning.github.io/faxios/pages/advanced/error-handling)
- [Middleware and plugins](https://adrianbrowning.github.io/faxios/pages/advanced/middleware)
- [Migrating from interceptors](https://adrianbrowning.github.io/faxios/pages/advanced/migrating-from-interceptors)
- [Schema validation](https://adrianbrowning.github.io/faxios/pages/advanced/schema-validation)
- [Typed endpoints: `define()`](https://adrianbrowning.github.io/faxios/pages/advanced/define)
- [Route builder: `route()`](https://adrianbrowning.github.io/faxios/pages/advanced/route)
- [Headers](https://adrianbrowning.github.io/faxios/pages/advanced/headers)
- [TypeScript](https://adrianbrowning.github.io/faxios/pages/advanced/type-script)

## Contributing

See [CONTRIBUTING.md](https://github.com/adrianbrowning/faxios/blob/main/CONTRIBUTING.md).

## Credits

faxios is a fork of [axios](https://github.com/axios/axios). axios is heavily inspired by the [$http service](https://docs.angularjs.org/api/ng/service/$http) in [AngularJS](https://angularjs.org/), and provides a standalone `$http`-like service for use outside AngularJS.

## License

[MIT](https://github.com/adrianbrowning/faxios/blob/main/LICENSE)
