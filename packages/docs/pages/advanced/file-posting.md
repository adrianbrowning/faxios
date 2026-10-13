# File posting

faxios makes file uploads straightforward. Use `postForm` or the runtime's global `FormData` when you need `multipart/form-data` uploads. Don't set `Content-Type` for a `FormData` body: faxios removes it so the header carries the boundary the runtime encoded the body with. A body from the npm `form-data` package rejects with `ERR_NOT_SUPPORT`; build a global `FormData` instead.

## Single file (browser)

Pass a `File` object directly as a field value — faxios will detect it and use the correct content type automatically:

```js check=types
import faxios from "@gcmdev/faxios";

const fileInput = /** @type {HTMLInputElement} */ (document.querySelector("#fileInput"));

await faxios.postForm("https://httpbin.org/post", {
  description: "My profile photo",
  file: fileInput.files?.[0],
});
```

## Multiple files (browser)

Pass a `FileList` to upload all selected files at once. They will all be sent under the same field name (`files[]`):

```js check=types
import faxios from "@gcmdev/faxios";

const fileInput = /** @type {HTMLInputElement} */ (document.querySelector("#fileInput"));

await faxios.postForm("https://httpbin.org/post", fileInput.files);
```

You can also pass the `FileList` (or array of `File` objects) explicitly under a custom field name by appending `[]` to the key:

```js check=types
import faxios from "@gcmdev/faxios";

const fileInput = /** @type {HTMLInputElement} */ (document.querySelector("#fileInput"));

await faxios.postForm("https://httpbin.org/post", {
  "files[]": fileInput.files,
});
```

To use distinct field names for each file, build a `FormData` object manually:

```js
import faxios from "@gcmdev/faxios";

const avatarFile = new File(["avatar bytes"], "avatar.png", { type: "image/png" });
const coverFile = new File(["cover bytes"], "cover.png", { type: "image/png" });

const formData = new FormData();
formData.append("avatar", avatarFile);
formData.append("cover", coverFile);

await faxios.post("https://httpbin.org/post", formData);
```

::: warning
`onUploadProgress` is called only where faxios can stream the request body, which today is Node.js. In browsers and web workers faxios never streams the body for progress, so the callback is not called. See [Fetch adapter](/pages/advanced/fetch-adapter) for details and [#209](https://github.com/adrianbrowning/faxios/issues/209) for upload progress in browsers.
:::

## Files in Node.js, Deno, and Bun

`FormData`, `File`, and `Blob` are globally available in every supported runtime, so the same code works everywhere. Build a `FormData` object and post it directly:

```js check=types
import faxios from "@gcmdev/faxios";
import fs from "node:fs";

const data = await fs.promises.readFile("/path/to/file.jpg");

const form = new FormData();
form.append("file", new Blob([data]), "file.jpg");
form.append("description", "My uploaded file");

await faxios.post("https://httpbin.org/post", form);
```

## Uploading a Blob

You can also upload an in-memory `Blob` directly:

```js
import faxios from "@gcmdev/faxios";

const blob = new Blob(["Hello, world!"], { type: "text/plain" });

const form = new FormData();
form.append("file", blob, "hello.txt");

await faxios.post("https://httpbin.org/post", form);
```

## Uploading raw bytes

To send a file as the whole request body (no multipart), pass the `File`, `Blob`, `ArrayBuffer`, typed array or stream as `data`. faxios does not set `Content-Type` for these bodies. The runtime uses the `Blob.type` (here `image/png`), or sends no `Content-Type` when there is none. Set the header yourself for an untyped `Blob`, an `ArrayBuffer`, a typed array or a stream if the server needs one. A plain string body is sent as `text/plain;charset=UTF-8` unless you set `Content-Type`.

```js
import faxios from "@gcmdev/faxios";

const file = new File(["png bytes"], "avatar.png", { type: "image/png" });
await faxios.put("https://httpbin.org/put", file);

const bytes = new Uint8Array([1, 2, 3]);
await faxios.put("https://httpbin.org/put", bytes, {
  headers: { "Content-Type": "application/octet-stream" },
});
```
