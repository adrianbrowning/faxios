# Fetch adapter

faxios sends every request through the web-standard `fetch` API, in the browser, Node.js, Deno, and Bun. The fetch adapter is the only transport and there is no `adapter` option to configure. To change how requests are sent, pass your own `fetch` through the `env` option (see [Custom fetch](#custom-fetch)).

The adapter supports response types such as `stream` and `formdata` (if supported by the environment).

::: info
faxios reports upload progress by streaming the request body, so `onUploadProgress` only fires where the runtime's `fetch` supports streaming request bodies (`duplex: "half"`), as Node.js does. Where it doesn't, the callback is not called. Download progress (`onDownloadProgress`) works everywhere.
:::

Proxies and connection agents are not configured through faxios options. Configure them at the runtime level instead: for example, pass a custom dispatcher/agent via `fetchOptions`, set the runtime's global proxy/dispatcher (Node's `undici` `ProxyAgent`, Deno/Bun proxy environment variables), or pass a custom `fetch` function through the `env` option — see [Custom fetch](#custom-fetch) below.

When `auth` is omitted, the fetch adapter can read HTTP Basic auth credentials from the request URL, for example `https://user:pass@example.com`. Percent-encoded URL credentials are decoded before the `Authorization` header is generated, and `auth` takes precedence over URL-embedded credentials.

## Custom fetch

You can customise the fetch adapter to use a custom `fetch` function instead of the environment global. You can pass a custom `fetch` function, `Request`, and `Response` constructors via the `env` config option. This is useful when working with custom environments or app frameworks that provide their own `fetch` implementation.

::: info
When using a custom `fetch` function, you may also need to supply matching `Request` and `Response` constructors. If you omit them, the global constructors will be used. If your custom `fetch` is incompatible with the globals, pass `null` to disable them.

**Note:** Setting `Request` and `Response` to `null` will make it impossible for the fetch adapter to capture download progress.
:::

### Basic example

```js
import faxios from '@gcmdev/faxios';

// Any function with the `fetch(input, init)` signature works, e.g. a wrapper around the global one:
/** @type {typeof fetch} */
const customFetchFunction = (input, init) => {
  console.log('fetching', input);
  return fetch(input, init);
};

const instance = faxios.create({
  onDownloadProgress(e) {
    console.log('downloadProgress', e);
  },
  env: {
    fetch: customFetchFunction,
  },
});

const { data } = await instance.get('https://api.example.com/users');
```

### Using with Tauri

[Tauri](https://tauri.app/plugin/http-client/) provides a platform `fetch` function that bypasses browser CORS restrictions for requests made from the native layer. The example below shows a minimal setup for using faxios inside a Tauri app with that custom fetch.

```js check=skip
import { fetch } from '@tauri-apps/plugin-http';
import faxios from '@gcmdev/faxios';

const instance = faxios.create({
  onDownloadProgress(e) {
    console.log('downloadProgress', e);
  },
  env: {
    fetch,
  },
});

const { data } = await instance.get('https://google.com');
```

### Using with SvelteKit

[SvelteKit](https://svelte.dev/docs/kit/web-standards#Fetch-APIs) provides a custom `fetch` implementation for server-side `load` functions that handles cookie forwarding and relative URLs. Because its `fetch` is incompatible with the standard `URL` API, faxios must be configured to use it explicitly, and the global `Request` and `Response` constructors must be disabled.

```js
import faxios from '@gcmdev/faxios';

/** @param {{ fetch: typeof globalThis.fetch }} event */
export async function load({ fetch }) {
  const { data: post } = await faxios.get('https://jsonplaceholder.typicode.com/posts/1', {
    env: {
      fetch,
      Request: null,
      Response: null,
    },
  });

  return { post };
}
```
