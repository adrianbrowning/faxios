# Envoi de fichiers

faxios simplifie l'envoi de fichiers. Utilisez `postForm` ou `FormData` lorsque vous avez besoin d'envois `multipart/form-data`.

`FormData` est une API web standard disponible dans tous les environnements pris en charge (navigateurs, Node.js 18+, Deno et Bun), donc les mêmes exemples fonctionnent partout.

## Fichier unique

Passez un objet `File` directement comme valeur de champ — faxios le détectera et utilisera automatiquement le type de contenu correct :

```js
await faxios.postForm("https://httpbin.org/post", {
  description: "My profile photo",
  file: document.querySelector("#fileInput").files[0],
});
```

## Plusieurs fichiers

Passez une `FileList` pour envoyer tous les fichiers sélectionnés en une seule fois. Ils seront tous envoyés sous le même nom de champ (`files[]`) :

```js
await faxios.postForm(
  "https://httpbin.org/post",
  document.querySelector("#fileInput").files
);
```

Vous pouvez également passer la `FileList` (ou un tableau d'objets `File`) explicitement sous un nom de champ personnalisé en ajoutant `[]` à la clé :

```js
await faxios.postForm("https://httpbin.org/post", {
  "files[]": document.querySelector("#fileInput").files,
});
```

Pour utiliser des noms de champs distincts pour chaque fichier, construisez un objet `FormData` manuellement :

```js
const formData = new FormData();
formData.append("avatar", avatarFile);
formData.append("cover", coverFile);

await faxios.post("https://httpbin.org/post", formData);
```

## Fichiers en dehors du navigateur

Dans les environnements hors navigateur (Node.js 18+, Deno, Bun), construisez un `FormData` avec un `Blob` ou un `File` standard. Par exemple, dans Node.js vous pouvez lire un fichier puis l'ajouter au formulaire :

```js
import { readFile } from "node:fs/promises";
import faxios from "faxios";

const bytes = await readFile("/path/to/file.jpg");

const form = new FormData();
form.append("file", new Blob([bytes]), "file.jpg");
form.append("description", "My uploaded file");

await faxios.post("https://httpbin.org/post", form);
```

::: info
L'adaptateur `fetch` ne peut pas signaler la progression d'un envoi, donc `onUploadProgress` n'est pas pris en charge. Seule la progression des téléchargements (`onDownloadProgress`) est disponible — voir [Capture de progression](/pages/advanced/progress-capturing).
:::
