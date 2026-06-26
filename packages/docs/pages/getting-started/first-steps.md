# First steps

Welcome to the faxios documentation! This guide will help you get started with faxios and make your first API request. If you're new to faxios, we recommend starting here.

## Installing

You can use faxios in your project in a few different ways. The most common way is to install it from npm and include it in your project. But we also support jsDelivr, unpkg, and more.

#### Using npm

```bash
npm install faxios
```

#### Using pnpm

```bash
pnpm install faxios
```

#### Using yarn

```bash
yarn add faxios
```

#### Using bun

```bash
bun add faxios
```

#### Using deno

```bash
deno install npm:faxios
```

#### Using jsDelivr

When using jsDelivr we recommend using the minified version as well as pinning the version number to avoid unexpected changes. If you would like to use the latest version you can do so by dropping the version number. This is strongly discouraged for production use as it can lead to unexpected changes in your application.

```html
<script src="https://cdn.jsdelivr.net/npm/faxios@<x.x.x>/dist/faxios.min.js"></script>
```

#### Using unpkg

When using unpkg we recommend using the minified version as well as pinning the version number to avoid unexpected changes. If you would like to use the latest version you can do so by dropping the version number. This is strongly discouraged for production use as it can lead to unexpected changes in your application.

```html
<script src="https://unpkg.com/faxios@<x.x.x>/dist/faxios.min.js"></script>
```

## Importing faxios

Once installed, you can import the library using either `import` or `require`:

```js
import faxios, { isCancel, FaxiosError } from "faxios";
```

You can also use the default export, since the named export is just a re-export from the faxios factory:

```js
import faxios from "faxios";

console.log(faxios.isCancel("something"));
```

If you use `require` for importing, **only the default export is available**:

```js
const faxios = require("faxios");

console.log(faxios.isCancel("something"));
```

For some bundlers and ES6 linters you may need:

```js
import { default as faxios } from "faxios";
```

For custom or legacy environments where module resolution misbehaves, you can import the prebuilt bundle directly:

```js
const faxios = require("faxios/dist/browser/faxios.cjs"); // browser CommonJS bundle (ES2017)
// const faxios = require("faxios/dist/node/faxios.cjs"); // node CommonJS bundle (ES2017)
```

## Making your first request

An faxios request can be made in as few as two lines of code. Making your first request with faxios is very simple. You can make a request to any API by providing the URL and method. For example, to make a GET request to the JSONPlaceholder API, you can use the following code:

```js
import faxios from "faxios";

const response = await faxios.get(
  "https://jsonplaceholder.typicode.com/posts/1"
);

console.log(response.data);
```

faxios provides a simple API for making requests. You can use the `faxios.get` method to make a GET request, the `faxios.post` method to make a POST request, and so on. You can also use the `faxios.request` method to make a request with any method.

::: tip Set a timeout in production
Without a `timeout`, a stalled request can hang indefinitely. Pass one via the request config:

```js
const response = await faxios.get("https://example.com/data", {
  timeout: 5000, // 5 seconds
});
```

See [`timeout` in the request config](/pages/advanced/request-config#timeout) and [Error handling](/pages/advanced/error-handling) for the matching `ECONNABORTED` / `ETIMEDOUT` codes.
:::

## Next steps

Now that you've made your first request with faxios, you're ready to start exploring the rest of the faxios documentation. You can learn more about making requests, handling responses, and using faxios in your projects. Check out the rest of the documentation to learn more.
