# Format multipart/form-data

faxios peut envoyer des requêtes au format `multipart/form-data`. Ce format est couramment utilisé lors de l'envoi de fichiers. Pour envoyer une requête dans ce format, vous devez créer un objet `FormData` et y ajouter les données. Vous pouvez ensuite passer l'objet `FormData` à la propriété `data` de la configuration de requête faxios.

```js
const formData = new FormData();
formData.append('foo', 'bar');

faxios.post('https://httpbin.org/post', formData);
```

Ne définissez pas manuellement l'en-tête `Content-Type` ; le runtime ajoute lui-même la boundary multipart lorsqu'il sérialise un corps `FormData`.

Le `FormData` global (ainsi que `Blob`/`File`) est disponible dans tous les runtimes pris en charge — navigateurs, Node.js 18+, Deno et Bun — donc le même code fonctionne partout. faxios n'inclut plus le package `form-data` :

```js
const form = new FormData();
form.append('my_field', 'my value');
form.append('my_file', new Blob([fileBytes]), 'bar.jpg');

faxios.post('https://example.com', form);
```

## Sérialisation automatique vers FormData <Badge type="tip" text="Nouveau" />

À partir de la version v0.27.0, faxios prend en charge la sérialisation automatique d'objets en objet FormData si l'en-tête Content-Type de la requête est défini à multipart/form-data. Cela signifie que vous pouvez passer directement un objet JavaScript à la propriété data de la configuration de requête faxios. Par exemple lors de l'envoi de données vers une requête POST :

```js
import faxios from 'faxios';

faxios
  .post(
    'https://httpbin.org/post',
    { x: 1 },
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
  .then(({ data }) => console.log(data));
```

faxios utilise le `FormData` global du runtime pour la sérialisation. Vous pouvez remplacer la classe via la variable de configuration `env.FormData`, mais vous n'en aurez probablement pas besoin dans la plupart des cas :

```js
import faxios from 'faxios';

faxios
  .post(
    'https://httpbin.org/post',
    { x: 1 },
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
  .then(({ data }) => console.log(data));
```

## Politique d'en-têtes pour `FormData` Node.js <Badge type="warning" text="Node.js uniquement" />

Lorsque vous passez un objet `FormData` Node.js qui expose `getHeaders()` (comme le package [`form-data`](https://github.com/form-data/form-data)), faxios copie par défaut tous les en-têtes qu'il retourne sur la requête. Cela préserve la compatibilité v1 mais peut être problématique lorsque l'objet `FormData` provient d'une source non fiable — `getHeaders()` pourrait écraser des en-têtes comme `Authorization` ou en injecter des arbitraires.

Définissez `formDataHeaderPolicy: 'content-only'` pour copier **uniquement** `Content-Type` et `Content-Length` depuis `getHeaders()`, puis définissez tout autre en-tête explicitement via la configuration `headers` de la requête :

```js
await faxios.post("https://example.com/upload", form, {
  formDataHeaderPolicy: "content-only",
  headers: {
    Authorization: "Bearer my-token",
  },
});
```

La valeur par défaut est `'legacy'`. Voir [`formDataHeaderPolicy`](/pages/advanced/request-config#formdataheaderpolicy) dans la référence de configuration de requête pour plus de détails.

## Terminaisons supportées

Le sérialiseur FormData d'faxios supporte quelques terminaisons spéciales pour effectuer les opérations suivantes :

- `{}` - sérialiser la valeur avec JSON.stringify
- `[]` - décomposer l'objet de type tableau en champs séparés avec la même clé

::: warning
Remarque : l'opération de décomposition/expansion sera utilisée par défaut sur les tableaux et les objets FileList
:::

## Configurer le sérialiseur FormData

Le sérialiseur FormData supporte des options supplémentaires via la propriété d'objet config.formSerializer pour gérer les cas particuliers :

- `visitor: Function` - fonction visiteur définie par l'utilisateur qui sera appelée récursivement pour sérialiser l'objet de données en objet FormData en suivant des règles personnalisées.
- `dots: boolean = false` - utiliser la notation pointée au lieu de crochets pour sérialiser les tableaux et les objets ;
- `metaTokens: boolean = true` - ajouter la terminaison spéciale (ex. `user{}: '{"name": "John"}'`) dans la clé FormData. Le body-parser du backend pourrait potentiellement utiliser ces méta-informations pour analyser automatiquement la valeur en JSON.
- `indexes: null|false|true = false` - contrôle comment les index seront ajoutés aux clés décomposées d'objets de type tableau plat
  - `null` - ne pas ajouter de crochets (`arr: 1`, `arr: 2`, `arr: 3`)
  - `false` (défaut) - ajouter des crochets vides (`arr[]: 1`, `arr[]: 2`, `arr[]: 3`)
  - `true` - ajouter des crochets avec index (`arr[0]: 1`, `arr[1]: 2`, `arr[2]: 3`)
- `maxDepth: number = 100` - profondeur maximale d'imbrication des objets dans laquelle le sérialiseur va récurser. Si l'entrée dépasse cette profondeur, une `FaxiosError` avec `code: 'ERR_FORM_DATA_DEPTH_EXCEEDED'` est levée. Cela protège les applications côté serveur contre les attaques DoS via des charges utiles profondément imbriquées. Définir à `Infinity` pour désactiver la limite.

```js
// Autoriser une imbrication plus profonde pour les schémas qui dépassent légitimement 100 niveaux :
faxios.postForm('/api', data, { formSerializer: { maxDepth: 200 } });
```

::: warning Note de sécurité
La limite par défaut de 100 est intentionnelle. Le code côté serveur qui transfère du JSON contrôlé par le client vers faxios en tant que `data` est vulnérable à un débordement de pile d'appels sans cette protection. N'augmentez `maxDepth` que si votre schéma le nécessite réellement.
:::

Par exemple, si nous avons un objet comme celui-ci :

```js
const obj = {
  x: 1,
  arr: [1, 2, 3],
  arr2: [1, [2], 3],
  users: [
    { name: 'Peter', surname: 'Griffin' },
    { name: 'Thomas', surname: 'Anderson' },
  ],
  'obj2{}': [{ x: 1 }],
};
```

Les étapes suivantes seront exécutées en interne par le sérialiseur faxios :

```js
const formData = new FormData();
formData.append('x', '1');
formData.append('arr[]', '1');
formData.append('arr[]', '2');
formData.append('arr[]', '3');
formData.append('arr2[0]', '1');
formData.append('arr2[1][0]', '2');
formData.append('arr2[2]', '3');
formData.append('users[0][name]', 'Peter');
formData.append('users[0][surname]', 'Griffin');
formData.append('users[1][name]', 'Thomas');
formData.append('users[1][surname]', 'Anderson');
formData.append('obj2{}', '[{"x":1}]');
```

faxios supporte les méthodes raccourcies suivantes : `postForm`, `putForm`, `patchForm` qui sont simplement les méthodes HTTP correspondantes avec l'en-tête `Content-Type` prédéfini à `multipart/form-data`.
