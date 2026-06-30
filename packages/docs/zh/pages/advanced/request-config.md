# 请求配置

请求配置用于配置 HTTP 请求的各项参数。虽然有大量可用选项，但唯一必填的选项是 `url`。如果配置对象中没有 `method` 字段，默认使用 `GET` 方法。

::: warning 安全提示：解压炸弹防护是可选的
默认情况下 `maxContentLength` 和 `maxBodyLength` 均为 `-1`（不限制）。恶意或被攻陷的服务器可能返回一个很小的 gzip/deflate/brotli/zstd 响应，解压后可达数 GB，从而耗尽 Node.js 进程的内存。

如果你向不完全可信的服务器发起请求，**请设置上限**：

```js
faxios.defaults.maxContentLength = 10 * 1024 * 1024; // 10 MB
faxios.defaults.maxBodyLength = 10 * 1024 * 1024;
```

详见[安全指南](/pages/misc/security)。
:::

### `url`

`url` 是请求的目标 URL，可以是字符串或 `URL` 实例。

### `method`

`method` 是请求使用的 HTTP 方法，默认为 `GET`。

### `baseURL`

`baseURL` 是拼接在 `url` 前面的基础 URL，除非 `url` 是绝对 URL。这对于向同一域名发起请求非常实用，无需在每次请求时重复写域名和 API 版本前缀。

### `allowAbsoluteUrls`

`allowAbsoluteUrls` 决定绝对 URL 是否可以覆盖已配置的 `baseUrl`。设置为 `true`（默认值）时，绝对 `url` 会覆盖 `baseUrl`；设置为 `false` 时，绝对 `url` 始终会拼接在 `baseUrl` 之后。

### `transformRequest`

`transformRequest` 函数允许你在数据发送到服务器之前对其进行修改，仅适用于 `PUT`、`POST`、`PATCH` 和 `DELETE` 请求方法。数组中的最后一个函数必须返回字符串、Buffer、ArrayBuffer、FormData 或 Stream 实例。

### `transformResponse`

`transformResponse` 函数允许你在数据传递给 `then` 或 `catch` 函数之前对响应数据进行修改，函数以响应数据为唯一参数。

### `parseReviver`

`parseReviver` 函数允许你向默认 `transformResponse` 所使用的原生 `JSON.parse()` 调用直接提供一个自定义的 "reviver" 函数。

这对于执行高性能的类型水合（例如将 ISO 字符串转换为 `Temporal` 或 `Date` 对象）或防止解析过程中的精度丢失尤为有用。

在支持 `JSON.parse` reviver `context` 参数的环境中，reviver 函数会接收第三个 `context` 参数，用于访问原始 JSON `source`，从而能够精确转换那些以标准 JavaScript 数字解析时会丢失精度的大整数（BigInt）。

> 注意：`Temporal` 尚未在所有环境中可用，必要时请考虑使用 polyfill。

```js
const client = faxios.create({
  parseReviver: (key, value, context) => {
    // 示例：精度安全的 BigInt 解析
    if (typeof value === 'number' && context?.source) {
      const isInteger = Number.isInteger(value);
      const isUnsafe = !Number.isSafeInteger(value);
      const isValidIntegerString = /^-?\d+$/.test(context.source);

      if (isInteger && isUnsafe && isValidIntegerString) {
        try {
          return BigInt(context.source);
        } catch {
          // 兜底：如果解析失败则返回原始值
        }
      }
    }

    // 示例：将日期水合为 Temporal 对象
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

`headers` 是随请求发送的 HTTP 请求头，默认将 `Content-Type` 设置为 `application/json`。

### `params`

`params` 是随请求发送的 URL 查询参数，必须是普通对象或 URLSearchParams 对象。如果 `url` 中已包含查询参数，它们将与 `params` 对象合并。

### `paramsSerializer`

`paramsSerializer` 函数允许你在参数发送到服务器之前自定义 `params` 对象的序列化方式，有多个可用选项，详见本页末尾的完整请求配置示例。

#### 严格的 RFC 3986 百分号编码

faxios 默认会将 `%3A`、`%24`、`%2C` 和 `%20` 解码回 `:`、`$`、`,` 和 `+`，以提升可读性（其中 `+` 遵循查询字符串中表示空格的 `application/x-www-form-urlencoded` 约定）。这些字符在 [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986#section-3.4) 中对查询组件而言都是合法的，因此默认输出是正确的。但部分后端要求严格的百分号编码，会拒绝这种可读形式。

可通过 `encode` 选项覆盖默认编码器：

```js
// 单次请求：对查询值使用严格的 RFC 3986 百分号编码
faxios.get('/foo', {
  params: { filter: JSON.stringify({ startedAt: '2026-01-23' }) },
  paramsSerializer: { encode: encodeURIComponent }
});

// 也可在实例默认值中设置
const client = faxios.create({
  paramsSerializer: { encode: encodeURIComponent }
});
```

### `data`

`data` 是作为请求体发送的数据，可以是字符串、普通对象、Buffer、ArrayBuffer、FormData、Stream 或 URLSearchParams，仅适用于 `PUT`、`POST`、`DELETE` 和 `PATCH` 请求方法。在未设置 `transformRequest` 的情况下，必须是以下类型之一：

- string、普通对象、ArrayBuffer、ArrayBufferView、URLSearchParams
- FormData、File、Blob（在所有受支持的运行时中可用）
- ReadableStream

对于 `FormData`，不要手动设置 `Content-Type`；运行时会自行添加 multipart boundary。

对于提供了 `getHeaders()` 方法的类 `FormData` 对象，faxios 默认会复制其返回的所有请求头，以保持 v1 兼容性。如果该对象是自定义的或不完全可信，可设置 `formDataHeaderPolicy: 'content-only'`，仅复制 `Content-Type` 和 `Content-Length`，其他请求头则通过请求 `headers` 配置显式设置。

### `formDataHeaderPolicy` <Badge type="warning" text="仅 Node.js" />

控制 faxios 如何复制 Node.js `FormData#getHeaders()` 返回的请求头。默认值为 `'legacy'`，即复制所有返回的请求头以保留现有的 v1 行为。设置为 `'content-only'` 时，仅从 `getHeaders()` 复制 `Content-Type` 和 `Content-Length`。

### `timeout`

`timeout` 是请求超时前等待的毫秒数。如果请求耗时超过 `timeout`，请求将被中止。

### `withCredentials`

`withCredentials` 属性指示跨域 Access-Control 请求是否应携带 cookie、授权请求头或 TLS 客户端证书等凭据。该设置对同源请求无效。

### `adapter`

`adapter` 允许自定义请求处理方式，便于测试。返回一个 Promise 并提供有效的响应，详见[适配器](/pages/advanced/adapters)文档。唯一的内置适配器是 `fetch`，默认值为 `['fetch']`，在所有运行时（浏览器、Node.js、Deno、Bun）中均可用。

你也可以传入自定义的适配器函数，或一个适配器数组，faxios 将使用当前环境支持的第一个适配器。

### `auth`

`auth` 表示使用 HTTP Basic 认证，并提供凭据。这将设置 `Authorization` 请求头，覆盖任何通过 `headers` 自定义的 `Authorization` 请求头。如果省略 `auth`，fetch 适配器可以从请求 URL 中提取 Basic 认证凭据，例如 `https://user:pass@example.com`；URL 中经过百分号编码的凭据会先解码，且 `auth` 始终优先于 URL 中的凭据。请注意，仅 HTTP Basic 认证可通过此参数配置，Bearer 令牌等请改用自定义 `Authorization` 请求头。

### `responseType`

`responseType` 指示服务器响应的数据类型，可以是以下之一：

- arraybuffer
- document
- json
- text
- stream
- blob（仅浏览器）
- formdata（仅 fetch 适配器）

### `responseEncoding` <Badge type="warning" text="仅 Node.js" />

`responseEncoding` 指示解码响应时使用的编码，支持以下选项：

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
注意：当 `responseType` 为 `stream` 或客户端请求时，此选项将被忽略
:::

### `xsrfCookieName`

`xsrfCookieName` 是用作 `XSRF` 令牌值的 cookie 名称。

### `xsrfHeaderName`

`xsrfHeaderName` 是用作 `XSRF` 令牌值的请求头名称。

### `withXSRFToken`

`withXSRFToken` 控制 faxios 在浏览器请求中是否读取 XSRF cookie 并设置 XSRF 请求头。可选值如下：

- `undefined` _（默认）_ — 仅在同源请求时设置 XSRF 请求头。
- `true` — 始终设置 XSRF 请求头，包括跨域请求。
- `false` — 永不设置 XSRF 请求头。
- `(config: InternalAxiosRequestConfig) => boolean | undefined` — 回调函数，按请求决定是否设置，会接收内部 config 对象。

```ts
withXSRFToken: boolean | undefined | ((config: InternalAxiosRequestConfig) => boolean | undefined);
```

::: warning 跨域 XSRF 与 `withCredentials`
`withCredentials` 控制跨站请求是否携带凭据（cookie、HTTP 认证）。在较旧版本的 faxios 中，设置 `withCredentials: true` 会隐式地让 faxios 在跨域请求中设置 XSRF 请求头。新版本 faxios 将这两个关注点分开：要在跨域请求中发送 XSRF 请求头，必须**同时**设置 `withCredentials: true` 和 `withXSRFToken: true`。

```js
faxios.get('/user', { withCredentials: true, withXSRFToken: true });
```
:::

### `onDownloadProgress`

`onDownloadProgress` 函数允许你监听下载进度。

### `maxContentLength`

`maxContentLength` 属性定义响应内容允许的最大字节数，由 fetch 适配器强制执行。fetch 适配器会在响应声明了长度、响应流可跟踪，或响应大小可确定时执行该限制。

> ⚠️ **安全提示：** 默认值为 `-1`（不限制）。响应不加限制再加上 gzip/deflate/brotli/zstd 解压，会带来解压炸弹导致的拒绝服务风险。
> 在访问不完全可信的服务器时，请显式设置该限制。

### `maxBodyLength`

`maxBodyLength` 属性定义请求体允许的最大字节数，由 fetch 适配器强制执行；fetch 适配器会在请求体长度可确定时执行该限制。

### `redact`

`redact` 属性是一个可选的配置键名数组，用于在 `FaxiosError` 通过 `toJSON()` 序列化时对匹配的键进行脱敏。匹配不区分大小写，并会在序列化后的请求配置中递归进行，命中的值会被替换为 `[REDACTED ****]`。

`redact` 仅影响错误序列化，不会修改请求数据、请求头或原始配置对象。

```js
faxios.get('/user/12345', {
  headers: { Authorization: 'Bearer token' },
  auth: { username: 'me', password: 'secret' },
  redact: ['authorization', 'password']
}).catch((error) => {
  console.log(error.toJSON().config);
});
```

### `validateStatus`

`validateStatus` 函数允许你覆盖默认的状态码验证逻辑。默认情况下，faxios 会在状态码不在 200-299 范围内时拒绝 Promise。你可以提供自定义的 `validateStatus` 函数来覆盖此行为，该函数应在状态码在你希望接受的范围内时返回 `true`。

### `cancelToken`

`cancelToken` 属性允许你创建一个取消令牌，用于取消请求。详见[取消请求](/pages/advanced/cancellation)文档。

### `signal`

`signal` 属性允许你向请求传入一个 `AbortSignal` 实例，从而通过 `AbortController` API 取消请求。

### `transitional`

`transitional` 属性允许你启用或禁用某些过渡性功能，可用选项如下：

- `silentJSONParsing`：若设置为 `true` _（默认）_，faxios 会在 JSON 解析失败时静默忽略错误，并保留原始响应字符串。设置为 `false` 则会抛出 `SyntaxError`。

  ::: tip 重要说明
  此选项仅在 `responseType` **显式**设置为 `'json'` 时生效。当未指定 `responseType` 时，faxios 会通过 `forcedJSONParsing` 尝试解析为 JSON，若失败则不论此设置如何，都会静默返回原始字符串。如果希望无效 JSON 抛出错误，请同时设置：

  ```js
  { responseType: 'json', transitional: { silentJSONParsing: false } }
  ```
  :::

- `forcedJSONParsing`：强制 faxios 将响应解析为 JSON，即使响应不是有效的 JSON。适用于返回无效 JSON 的 API。
- `clarifyTimeoutError`：在请求超时时提供更清晰的错误信息，适用于调试超时问题。
- `advertiseZstdAcceptEncoding`：设为 `true` 时，如果当前 Node.js 运行时支持 zstd 解压，faxios 会在默认 `Accept-Encoding` 请求头中加入 `zstd`。在受支持且 `decompress` 为 `true` 时，zstd 响应仍会自动解压。
- `legacyInterceptorReqResOrdering`：设置为 true 时使用旧版拦截器请求/响应排序。

### `env`

`env` 属性允许你设置一些配置选项，例如用于自动将数据序列化为 FormData 对象的 FormData 类。

- FormData: window?.FormData || global?.FormData

### `formSerializer`

`formSerializer` 选项允许你配置普通对象作为请求 `data` 时如何序列化为 `multipart/form-data`。可用选项：

- `visitor` — 对每个值递归调用的自定义访问者函数
- `dots` — 使用点号表示法代替方括号表示法
- `metaTokens` — 保留特殊的键后缀（如 `{}`）
- `indexes` — 控制数组键的方括号格式（`null` / `false` / `true`）
- `maxDepth` _（默认：`100`）_ — 抛出 `FaxiosError`（错误码 `ERR_FORM_DATA_DEPTH_EXCEEDED`）前的最大嵌套深度。设置为 `Infinity` 可禁用。

详见 [multipart/form-data](/pages/advanced/multipart-form-data-format) 页面以及本页末尾的完整请求配置示例。

## 完整请求配置示例

```js
{
  url: "/posts",
  method: "get",
  baseURL: "https://jsonplaceholder.typicode.com",
  allowAbsoluteUrls: true,
  transformRequest: [function (data, headers) {
    return data;
  }],
  transformResponse: [function (data) {
    return data;
  }],
  headers: {"X-Requested-With": "XMLHttpRequest"},
  params: {
    postId: 5
  },
  paramsSerializer: {
    // 自定义编码函数，以迭代方式逐个序列化键值对。
    encode?: (param: string): string => { /* 在此执行自定义操作并返回转换后的字符串 */ },

    // 对整个参数进行自定义序列化的函数，允许用户模拟 1.x 之前的行为。
    serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions ),

    // 配置数组索引在参数中的格式。
    // 三种可用选项：
      // (1) indexes: null（不添加方括号）
      // (2)（默认）indexes: false（添加空方括号）
      // (3) indexes: true（添加带索引的方括号）
    indexes: false,

    // 序列化参数时的最大对象嵌套深度。超过时抛出 FaxiosError
    // (ERR_FORM_DATA_DEPTH_EXCEEDED)。默认：100。设置为 Infinity 可禁用。
    maxDepth: 100

  },
  data: {
    firstName: "Fred"
  },
  formDataHeaderPolicy: "legacy",
  // 另一种将数据发送到请求体的语法，仅适用于 POST 方法，只发送值，不发送键
  data: "Country=Brasil&City=Belo Horizonte",
  timeout: 1000,
  withCredentials: false,
  adapter: function (config) {
    // 在此执行自定义逻辑
  },
  adapter: ["fetch"],
  auth: {
    username: "janedoe",
    password: "s00pers3cret"
  },
  responseType: "json",
  responseEncoding: "utf8",
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  withXSRFToken: boolean | undefined | ((config: InternalAxiosRequestConfig) => boolean | undefined),
  onDownloadProgress: function ({loaded, total, progress, bytes, estimated, rate, download = true}) {
    // 在此处理 faxios 进度事件
  },
  maxContentLength: 2000,
  maxBodyLength: 2000,
  redact: ['authorization', 'password'],
  validateStatus: function (status) {
    return status >= 200 && status < 300;
  },
  cancelToken: new CancelToken(function (cancel) {
    cancel("Operation has been canceled.");
  }),
  signal: new AbortController().signal,
  transitional: {
    silentJSONParsing: true,
    forcedJSONParsing: true,
    clarifyTimeoutError: false,
    advertiseZstdAcceptEncoding: false,
    legacyInterceptorReqResOrdering: true,
  },
  env: {
    FormData: window?.FormData || global?.FormData
  },
  formSerializer: {
      // 自定义访问者函数，用于序列化表单值
      visitor: (value, key, path, helpers) => {};

      // 使用点号表示法代替方括号格式
      dots: boolean;

      // 在参数键中保留特殊结尾（如 {}）
      metaTokens: boolean;

      // 使用数组索引格式：
        // null - 不添加方括号
        // false - 添加空方括号
        // true - 添加带索引的方括号
      indexes: boolean;

      // 最大对象嵌套深度。超过时抛出 FaxiosError (ERR_FORM_DATA_DEPTH_EXCEEDED)。
      // 默认：100。设置为 Infinity 可禁用。
      maxDepth: 100;
  }
}
```
