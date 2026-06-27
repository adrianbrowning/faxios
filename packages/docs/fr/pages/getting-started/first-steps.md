# Premiers pas

Bienvenue dans la documentation d'faxios ! Ce guide vous aidera à démarrer avec faxios et à effectuer votre première requête API. Si vous débutez avec faxios, nous vous recommandons de commencer ici.

## Installation

Vous pouvez utiliser faxios dans votre projet de plusieurs façons. La méthode la plus courante consiste à l'installer depuis npm et à l'inclure dans votre projet. Nous supportons également jsDelivr, unpkg, et d'autres options.

#### Avec npm

```bash
npm install faxios
```

#### Avec pnpm

```bash
pnpm install faxios
```

#### Avec yarn

```bash
yarn add faxios
```

#### Avec bun

```bash
bun add faxios
```

#### Avec deno

```bash
deno install npm:faxios
```

#### Avec jsDelivr

Lors de l'utilisation de jsDelivr, nous recommandons d'utiliser la version minifiée ainsi que d'épingler le numéro de version afin d'éviter des changements inattendus. Si vous souhaitez utiliser la dernière version, vous pouvez le faire en omettant le numéro de version. Ceci est fortement déconseillé en production car cela peut entraîner des modifications inattendues dans votre application.

```html
<script src="https://cdn.jsdelivr.net/npm/faxios@<x.x.x>/dist/faxios.min.js"></script>
```

#### Avec unpkg

Lors de l'utilisation d'unpkg, nous recommandons d'utiliser la version minifiée ainsi que d'épingler le numéro de version afin d'éviter des changements inattendus. Si vous souhaitez utiliser la dernière version, vous pouvez le faire en omettant le numéro de version. Ceci est fortement déconseillé en production car cela peut entraîner des modifications inattendues dans votre application.

```html
<script src="https://unpkg.com/faxios@<x.x.x>/dist/faxios.min.js"></script>
```

## Importer faxios

Une fois installé, vous pouvez importer la bibliothèque en utilisant `import` ou `require` :

```js
import faxios, { isCancel, FaxiosError } from "faxios";
```

Vous pouvez également utiliser l'export par défaut, puisque l'export nommé est juste une réexportation depuis la fabrique faxios :

```js
import faxios from "faxios";

console.log(faxios.isCancel("something"));
```

Si vous utilisez `require` pour l'importation, **seul l'export par défaut est disponible** :

```js
const faxios = require("faxios");

console.log(faxios.isCancel("something"));
```

Pour certains bundlers et linters ES6, vous pourriez avoir besoin de :

```js
import { default as faxios } from "faxios";
```

Pour les environnements personnalisés ou hérités où la résolution de modules ne se comporte pas correctement, vous pouvez importer le bundle préconstruit directement :

```js
const faxios = require("faxios/dist/browser/faxios.cjs"); // bundle CommonJS navigateur (ES2017)
// const faxios = require("faxios/dist/node/faxios.cjs"); // bundle CommonJS Node (ES2017)
```

## Votre première requête

Une requête faxios peut être effectuée en seulement deux lignes de code. Envoyer votre première requête avec faxios est très simple. Vous pouvez interroger n'importe quelle API en fournissant l'URL et la méthode. Par exemple, pour effectuer une requête GET vers l'API JSONPlaceholder, vous pouvez utiliser le code suivant :

```js
import faxios from "faxios";

const response = await faxios.get(
  "https://jsonplaceholder.typicode.com/posts/1"
);

console.log(response.data);
```

faxios propose une API simple pour effectuer des requêtes. Vous pouvez utiliser la méthode `faxios.get` pour une requête GET, la méthode `faxios.post` pour une requête POST, et ainsi de suite. Vous pouvez également utiliser la méthode `faxios.request` pour effectuer une requête avec n'importe quelle méthode HTTP.

::: tip Définissez un timeout en production
Sans `timeout`, une requête bloquée peut rester en attente indéfiniment. Passez-en un via la configuration de requête :

```js
const response = await faxios.get("https://example.com/data", {
  timeout: 5000, // 5 secondes
});
```

Voir [`timeout` dans la configuration de requête](/pages/advanced/request-config#timeout) et [Gestion des erreurs](/pages/advanced/error-handling) pour les codes `ECONNABORTED` / `ETIMEDOUT` correspondants.
:::

## Prochaines étapes

Maintenant que vous avez effectué votre première requête avec faxios, vous êtes prêt à explorer le reste de la documentation. Vous pouvez en apprendre davantage sur l'envoi de requêtes, la gestion des réponses et l'utilisation d'faxios dans vos projets. Consultez le reste de la documentation pour en savoir plus.
