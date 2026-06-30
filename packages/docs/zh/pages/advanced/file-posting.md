# 文件上传

faxios 让文件上传变得简单。需要 `multipart/form-data` 上传时，使用 `postForm` 或 `FormData` 即可。

## 单文件上传（浏览器）

直接将 `File` 对象作为字段值传入——faxios 会自动检测并使用正确的内容类型：

```js
await faxios.postForm("https://httpbin.org/post", {
  description: "My profile photo",
  file: document.querySelector("#fileInput").files[0],
});
```

## 多文件上传（浏览器）

传入 `FileList` 可一次性上传所有选中的文件，所有文件将使用相同的字段名（`files[]`）发送：

```js
await faxios.postForm(
  "https://httpbin.org/post",
  document.querySelector("#fileInput").files
);
```

也可以通过在键名末尾追加 `[]` 来显式指定一个自定义字段名，传入 `FileList`（或 `File` 对象数组）：

```js
await faxios.postForm("https://httpbin.org/post", {
  "files[]": document.querySelector("#fileInput").files,
});
```

如需为每个文件使用不同的字段名，请手动构建 `FormData` 对象：

```js
const formData = new FormData();
formData.append("avatar", avatarFile);
formData.append("cover", coverFile);

await faxios.post("https://httpbin.org/post", formData);
```

## 在所有运行时中使用 FormData

`FormData` 通过原生 fetch 在所有运行时（浏览器、Node.js 18+、Deno、Bun）中工作，无需额外的依赖包。在现代 Node.js（v18+）中，全局 `FormData` 与 `Blob` 已原生可用，可用于以传输无关的方式构建上传内容：

```js
const form = new FormData();
form.append("file", new Blob(["Hello, world!"], { type: "text/plain" }), "hello.txt");
form.append("description", "My uploaded file");

await faxios.post("https://httpbin.org/post", form);
```
