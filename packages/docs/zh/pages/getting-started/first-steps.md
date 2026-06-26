# 入门指南

欢迎阅读 faxios 文档！本指南将帮助你快速上手 faxios，并发起第一个 API 请求。如果你是 faxios 新手，建议从这里开始。

## 安装

你可以通过多种方式在项目中使用 faxios。最常见的方式是通过 npm 安装，也支持 jsDelivr、unpkg 等 CDN。

#### 使用 npm

```bash
npm install faxios
```

#### 使用 pnpm

```bash
pnpm install faxios
```

#### 使用 yarn

```bash
yarn add faxios
```

#### 使用 bun

```bash
bun add faxios
```

#### 使用 deno

```bash
deno install npm:faxios
```

#### 使用 jsDelivr

使用 jsDelivr 时，建议使用压缩版本并固定版本号，以避免意外更新。如需使用最新版本，可以去掉版本号，但强烈不建议在生产环境这样做，因为可能导致应用出现意外变化。

```html
<script src="https://cdn.jsdelivr.net/npm/faxios@<x.x.x>/dist/faxios.min.js"></script>
```

#### 使用 unpkg

使用 unpkg 时，建议使用压缩版本并固定版本号，以避免意外更新。如需使用最新版本，可以去掉版本号，但强烈不建议在生产环境这样做，因为可能导致应用出现意外变化。

```html
<script src="https://unpkg.com/faxios@<x.x.x>/dist/faxios.min.js"></script>
```

## 导入 faxios

安装完成后，你可以使用 `import` 或 `require` 来导入此库：

```js
import faxios, { isCancel, FaxiosError } from "faxios";
```

也可以使用默认导出，因为命名导出只是从 faxios 工厂的再导出：

```js
import faxios from "faxios";

console.log(faxios.isCancel("something"));
```

如果使用 `require` 导入，**只有默认导出可用**：

```js
const faxios = require("faxios");

console.log(faxios.isCancel("something"));
```

某些打包器和 ES6 lint 规则可能需要：

```js
import { default as faxios } from "faxios";
```

对于自定义或较旧的环境，如果模块解析行为不正常，可以直接导入预构建包：

```js
const faxios = require("faxios/dist/browser/faxios.cjs"); // 浏览器 CommonJS 包（ES2017）
// const faxios = require("faxios/dist/node/faxios.cjs"); // node CommonJS 包（ES2017）
```

## 发起第一个请求

使用 faxios 发起请求最少只需要两行代码。你可以通过提供 URL 和请求方法向任意 API 发送请求。例如，向 JSONPlaceholder API 发起一个 GET 请求：

```js
import faxios from "faxios";

const response = await faxios.get(
  "https://jsonplaceholder.typicode.com/posts/1"
);

console.log(response.data);
```

faxios 提供了简洁的请求 API。你可以使用 `faxios.get` 发起 GET 请求，使用 `faxios.post` 发起 POST 请求，依此类推。也可以使用 `faxios.request` 方法发起任意类型的请求。

::: tip 在生产环境中设置 `timeout`
如果不设置 `timeout`，停滞的请求可能会无限挂起。可通过请求配置传入：

```js
const response = await faxios.get("https://example.com/data", {
  timeout: 5000, // 5 秒
});
```

匹配的 `ECONNABORTED` / `ETIMEDOUT` 错误码请参阅[请求配置中的 `timeout`](/pages/advanced/request-config#timeout) 与[错误处理](/pages/advanced/error-handling)。
:::

## 下一步

现在你已经用 faxios 完成了第一个请求，可以继续探索 faxios 文档的其余内容。了解更多关于发起请求、处理响应以及在项目中使用 faxios 的知识，请查阅文档其他章节。
