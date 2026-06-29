# Publicación de archivos

faxios facilita la subida de archivos. Usa `postForm` o `FormData` cuando necesites subidas en formato `multipart/form-data`.

## Archivo único (navegador)

Pasa un objeto `File` directamente como valor de campo — faxios lo detectará y usará automáticamente el tipo de contenido correcto:

```js
await faxios.postForm("https://httpbin.org/post", {
  description: "My profile photo",
  file: document.querySelector("#fileInput").files[0],
});
```

## Múltiples archivos (navegador)

Pasa un `FileList` para subir todos los archivos seleccionados a la vez. Todos se enviarán bajo el mismo nombre de campo (`files[]`):

```js
await faxios.postForm(
  "https://httpbin.org/post",
  document.querySelector("#fileInput").files
);
```

También puedes pasar el `FileList` (o un arreglo de objetos `File`) explícitamente bajo un nombre de campo personalizado añadiendo `[]` a la clave:

```js
await faxios.postForm("https://httpbin.org/post", {
  "files[]": document.querySelector("#fileInput").files,
});
```

Para usar nombres de campo distintos para cada archivo, construye un objeto `FormData` manualmente:

```js
const formData = new FormData();
formData.append("avatar", avatarFile);
formData.append("cover", coverFile);

await faxios.post("https://httpbin.org/post", formData);
```

## Archivos en Node.js

faxios usa la API web estándar `fetch` en todos los entornos, así que el `FormData` global nativo funciona igual en navegadores, Node.js 18+, Deno y Bun — sin paquetes adicionales. Adjunta el contenido del archivo como un `Blob`:

```js
import { readFile } from "node:fs/promises";
import faxios from "faxios";

const form = new FormData();
const fileData = await readFile("/path/to/file.jpg");
form.append("file", new Blob([fileData]), "file.jpg");
form.append("description", "My uploaded file");

await faxios.post("https://httpbin.org/post", form);
```

::: info
El progreso de carga (`onUploadProgress`) no está disponible, porque la API web estándar `fetch` no puede emitir eventos de progreso de carga. El progreso de descarga sigue funcionando — consulta [Captura de progreso](/pages/advanced/progress-capturing).
:::
