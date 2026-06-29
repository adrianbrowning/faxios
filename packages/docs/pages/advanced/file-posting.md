# File posting

faxios makes file uploads straightforward. Use `postForm` or `FormData` when you need `multipart/form-data` uploads.

## Single file (browser)

Pass a `File` object directly as a field value — faxios will detect it and use the correct content type automatically:

```js
await faxios.postForm("https://httpbin.org/post", {
  description: "My profile photo",
  file: document.querySelector("#fileInput").files[0],
});
```

## Multiple files (browser)

Pass a `FileList` to upload all selected files at once. They will all be sent under the same field name (`files[]`):

```js
await faxios.postForm(
  "https://httpbin.org/post",
  document.querySelector("#fileInput").files
);
```

You can also pass the `FileList` (or array of `File` objects) explicitly under a custom field name by appending `[]` to the key:

```js
await faxios.postForm("https://httpbin.org/post", {
  "files[]": document.querySelector("#fileInput").files,
});
```

To use distinct field names for each file, build a `FormData` object manually:

```js
const formData = new FormData();
formData.append("avatar", avatarFile);
formData.append("cover", coverFile);

await faxios.post("https://httpbin.org/post", formData);
```

::: warning
The `fetch` API cannot emit upload progress events, so upload progress is not available. Download progress is captured via `onDownloadProgress` — see [Progress capturing](/pages/advanced/progress-capturing).
:::

## Files in Node.js, Deno, and Bun

`FormData`, `File`, and `Blob` are globally available in every supported runtime, so the same code works everywhere. Build a `FormData` object and post it directly:

```js
import faxios from "faxios";

const data = await fs.promises.readFile("/path/to/file.jpg");

const form = new FormData();
form.append("file", new Blob([data]), "file.jpg");
form.append("description", "My uploaded file");

await faxios.post("https://httpbin.org/post", form);
```

## Uploading a Blob

You can also upload an in-memory `Blob` directly:

```js
const blob = new Blob(["Hello, world!"], { type: "text/plain" });

const form = new FormData();
form.append("file", blob, "hello.txt");

await faxios.post("https://httpbin.org/post", form);
```
