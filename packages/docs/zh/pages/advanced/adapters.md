# 适配器

适配器允许你自定义 faxios 处理请求数据的方式。faxios 内置的唯一适配器是基于 Web 标准的 `fetch`，它在所有运行时（浏览器、Node.js 18+、Deno、Bun）中都可用。默认配置为 `['fetch']`。

编写自定义适配器可以让你完全掌控 faxios 如何发起请求和处理响应，适用于测试、自定义传输或非标准环境等场景。

## 内置适配器

可以通过 `adapter` 配置选项按名称选择内置适配器。唯一的内置适配器是 `fetch`：

```js
// 使用 fetch 适配器
const instance = faxios.create({ adapter: "fetch" });
```

你也可以传入一个适配器名称数组，faxios 将使用当前环境支持的第一个；默认值为 `['fetch']`：

```js
const instance = faxios.create({ adapter: ["fetch"] });
```

关于 `fetch` 适配器的更多详情，请参阅 [Fetch 适配器](/pages/advanced/fetch-adapter)页面。

## 创建自定义适配器

要创建自定义适配器，需要编写一个接受 `config` 对象并返回 Promise 的函数，该 Promise 需解析为有效的 faxios 响应对象。

```js
import faxios from "faxios";
import { settle } from "faxios/unsafe/core/settle.js";

function myAdapter(config) {
  /**
   * 到此时：
   * - config 已与默认配置合并
   * - 请求转换器已执行
   * - 请求拦截器已执行
   *
   * 适配器现在负责发起请求
   * 并返回有效的响应对象。
   */

  return new Promise((resolve, reject) => {
    // 在此执行自定义请求逻辑。
    // 本示例以原生 fetch API 为起点。
    fetch(config.url, {
      method: config.method?.toUpperCase() ?? "GET",
      headers: config.headers?.toJSON() ?? {},
      body: config.data,
      signal: config.signal,
    })
      .then(async (fetchResponse) => {
        const responseData = await fetchResponse.text();

        const response = {
          data: responseData,
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          headers: Object.fromEntries(fetchResponse.headers.entries()),
          config,
          request: null,
        };

        // settle 根据 HTTP 状态码决定是 resolve 还是 reject
        settle(resolve, reject, response);

        /**
         * 到此后：
         * - 响应转换器将执行
         * - 响应拦截器将执行
         */
      })
      .catch(reject);
  });
}

const instance = faxios.create({ adapter: myAdapter });
```

::: tip
`settle` 辅助函数对 2xx 状态码 resolve Promise，对其他状态码 reject Promise，与 faxios 的默认行为一致。如果需要自定义状态码验证，请改用 `validateStatus` 配置选项。
:::
