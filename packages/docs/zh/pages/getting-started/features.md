# 功能特性

faxios 是一个功能强大的 HTTP 客户端，提供简单易用的 API 来发起 HTTP 请求。它支持所有主流浏览器，在 JavaScript 社区中被广泛使用。以下是 faxios 的核心特性，这些特性使其成为你下一个项目的优选方案。

## 同构（Isomorphic）

faxios 是一个通用 HTTP 客户端，可在浏览器和 Node.js 中同时使用。这意味着你既可以在前端代码中发起 API 请求，也可以在后端代码中使用 faxios，非常适合构建渐进式 Web 应用、单页应用以及服务端渲染应用。

对于同时负责前后端开发的团队，faxios 也是绝佳选择。统一使用 faxios 发起 HTTP 请求，可以降低代码库的复杂度，保持前后端 API 的一致性。

## Fetch 支持 <Badge type="tip" text="新特性" />

faxios 完全基于 Web 标准 Fetch API 构建，这是其在所有受支持环境（浏览器、Node.js 18+、Deno 和 Bun）中唯一的 HTTP 传输层。无需任何配置——默认即使用 `fetch` 适配器。

## 浏览器支持

faxios 支持所有主流浏览器及部分较旧的浏览器，包括 Chrome、Firefox、Safari 和 Edge，是构建需要兼容多种浏览器的 Web 应用的理想选择。

## Node.js 支持

faxios 同样支持多个 Node.js 版本，兼容性经过测试，最早可追溯至 v12.x，在无法或不便升级到最新 Node.js 版本的环境中同样可以放心使用。

此外，faxios 还有针对 Bun 和 Deno 的冒烟测试，用于验证关键的运行时行为，增强跨运行时兼容性的可信度。

## 其他特性

- 支持 Promise API
- 拦截请求和响应
- 转换请求和响应数据
- AbortController 支持
- 超时设置
- 支持嵌套参数的查询字符串序列化
- 自动将请求体序列化为：
  - JSON（application/json）
  - Multipart / FormData（multipart/form-data）
  - URL 编码表单（application/x-www-form-urlencoded）
- 将 HTML 表单数据以 JSON 格式发送
- 自动处理响应中的 JSON 数据
- 支持浏览器和 Node.js 的进度捕获，并提供额外信息（传输速率、剩余时间）
- 支持在 Node.js 中设置带宽限制
- 兼容规范的 FormData 和 Blob（包括 Node.js 环境）
- 客户端 XSRF 防护支持
