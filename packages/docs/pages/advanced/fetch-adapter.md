# Fetch adapter

faxios sends every request through the web-standard `fetch` API, in the browser, Node.js, Deno, and Bun. The fetch adapter is the only transport and there is no `adapter` option to configure. To change how requests are sent, pass your own `fetch` through the `env` option (see [Custom fetch](#custom-fetch)).

The adapter supports response types such as `stream` and `formdata` (if supported by the environment).

With `responseType: "stream"`, the [`timeout`](/pages/advanced/request-config#timeout) and the [`signal`](/pages/advanced/request-config#signal) stay active until the body is fully read or cancelled, so a stalled body still times out (counted from when the request started) and an abort still stops it. faxios clears the timer and removes its listener from your `signal` when the body ends, errors or is cancelled. A response with no body is cleaned up when the promise resolves. If a request fails, for example because a response goes over `maxContentLength`, faxios aborts the `signal` it passed to `fetch`, which closes the connection and cancels any body still being sent or received.

::: info
faxios reports upload progress by streaming the request body (`duplex: "half"`). It does that only outside browsers, and only where the runtime's `fetch` can stream a request body: today that is Node.js, not Deno or Bun. Everywhere else `onUploadProgress` is not called and the body is sent as it is. In browsers and web workers faxios never streams the body for progress, because Chromium sends a streamed request body only over HTTP/2 or later and WebKit not at all, so the upload would fail. A body you pass as a `ReadableStream` is still sent as a stream. A `FormData` body is not read into memory to measure it, so its progress events have `lengthComputable: false` and no `total`. Upload progress in browsers is tracked in [#209](https://github.com/adrianbrowning/faxios/issues/209). Download progress (`onDownloadProgress`) works everywhere.
:::

Proxies and connection agents are not configured through faxios options. Configure them at the runtime level instead: for example, pass a custom dispatcher/agent via `fetchOptions`, set the runtime's global proxy/dispatcher (Node's `undici` `ProxyAgent`, Deno/Bun proxy environment variables), or pass a custom `fetch` function through the `env` option — see [Custom fetch](#custom-fetch) below.

When `auth` is omitted, the fetch adapter can read HTTP Basic auth credentials from the request URL, for example `https://user:pass@example.com`. Percent-encoded URL credentials are decoded before the `Authorization` header is generated, and `auth` takes precedence over URL-embedded credentials.

## Fetch options

`fetchOptions` sets extra init members for a request. faxios copies every own enumerable key of `fetchOptions` into the init it passes to `fetch`. That covers spec `RequestInit` members such as `cache` or `redirect`, and runtime or framework extensions such as Next.js `next`, Cloudflare Workers `cf`, Node's `undici` `dispatcher`, or any key a custom `env.fetch` reads. Inherited keys are ignored. faxios sets `signal`, `method`, `headers`, `body`, `duplex` and `credentials` itself, and ignores those keys in `fetchOptions`.

The init has a null prototype, and faxios writes the spec default for each member the caller doesn't set. So a polluted `Object.prototype.redirect`, `integrity` or `mode` can't change a request. The same holds for `env`: faxios uses `fetch`, `Request` and `Response` only when they are own properties of `env`.

## Custom fetch

You can customise the fetch adapter to use a custom `fetch` function instead of the environment global. You can pass a custom `fetch` function, `Request`, and `Response` constructors via the `env` config option. This is useful when working with custom environments or app frameworks that provide their own `fetch` implementation.

faxios reads `env.fetch` for each request, so passing a new `fetch` on every request (as in the SvelteKit example below) costs nothing extra and doesn't grow memory. faxios checks what the `Request` and `Response` constructors support once per pair and reuses the result.

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
