# Fetch 适配器 <Badge type="tip" text="新特性" />

`fetch` 适配器基于 Web 标准的 `fetch` API，是 faxios 在所有运行时（浏览器、Node.js、Deno、Bun）使用的唯一适配器。它会自动选用，无需额外配置，但你也可以在创建 faxios 实例时通过 `adapter` 选项显式指定。

```js
import faxios from 'faxios';

const instance = faxios.create({
  adapter: 'fetch',
});
```

该适配器无法报告上传进度（fetch 不支持上传进度事件），仅支持通过 `onDownloadProgress` 捕获下载进度。它还支持额外的响应类型，如 `stream` 和 `formdata`（如果环境支持）。代理与自定义传输（dispatcher/agent）可通过 `fetchOptions` 或运行时层面的 dispatcher 配置。

当省略 `auth` 时，fetch 适配器可以从请求 URL 中读取 HTTP Basic 认证凭据，例如 `https://user:pass@example.com`。生成 `Authorization` 请求头前会先解码 URL 中经过百分号编码的凭据，并且 `auth` 优先于 URL 中的凭据。

## 自定义 fetch <Badge type="tip" text="v1.12.0+" />

从 `v1.12.0` 起，你可以自定义 fetch 适配器，使用自定义的 `fetch` 函数代替环境全局的 `fetch`。可以通过 `env` 配置选项传入自定义的 `fetch` 函数、`Request` 和 `Response` 构造函数。这在使用提供了自己 `fetch` 实现的自定义环境或应用框架时非常实用。

::: info
使用自定义 `fetch` 函数时，可能还需要提供匹配的 `Request` 和 `Response` 构造函数。如果省略，将使用全局构造函数。如果你的自定义 `fetch` 与全局构造函数不兼容，可以传入 `null` 来禁用它们。

**注意：** 将 `Request` 和 `Response` 设置为 `null` 后，fetch 适配器将无法捕获下载进度。
:::

### 基本示例

```js
import customFetchFunction from 'customFetchModule';

const instance = faxios.create({
  adapter: 'fetch',
  onDownloadProgress(e) {
    console.log('downloadProgress', e);
  },
  env: {
    fetch: customFetchFunction,
    Request: null, // null -> 禁用该构造函数
    Response: null,
  },
});
```

### 与 Tauri 一起使用

[Tauri](https://tauri.app/plugin/http-client/) 提供了一个平台 `fetch` 函数，可绕过浏览器对原生层请求的 CORS 限制。以下示例展示了在 Tauri 应用中使用该自定义 fetch 配置 faxios 的最简设置。

```js
import { fetch } from '@tauri-apps/plugin-http';
import faxios from 'faxios';

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

### 与 SvelteKit 一起使用

[SvelteKit](https://svelte.dev/docs/kit/web-standards#Fetch-APIs) 为服务端 `load` 函数提供了自定义的 `fetch` 实现，用于处理 Cookie 转发和相对 URL。由于其 `fetch` 与标准 `URL` API 不兼容，必须明确配置 faxios 使用它，并禁用全局 `Request` 和 `Response` 构造函数。

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
