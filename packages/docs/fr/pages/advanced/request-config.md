# Configuration de requête

La configuration de requête est utilisée pour paramétrer la requête. Un large éventail d'options est disponible, mais la seule option obligatoire est `url`. Si l'objet de configuration ne contient pas de champ `method`, la méthode par défaut est `GET`.

::: warning Sécurité : la protection contre les bombes de décompression est optionnelle
Par défaut, `maxContentLength` et `maxBodyLength` valent `-1` (illimité). Un serveur malveillant ou compromis peut renvoyer un petit corps compressé en gzip/deflate/brotli/zstd qui s'étend à plusieurs gigaoctets et épuise la mémoire du processus.

Si vous appelez des serveurs auxquels vous ne faites pas pleinement confiance, **définissez un plafond** :

```js
faxios.defaults.maxContentLength = 10 * 1024 * 1024; // 10 Mo
faxios.defaults.maxBodyLength = 10 * 1024 * 1024;
```

Consultez le [guide de sécurité](/pages/misc/security) pour plus de détails.
:::

### `url`

L'`url` est l'URL vers laquelle la requête est envoyée. Il peut s'agir d'une chaîne de caractères ou d'une instance de `URL`.

### `method`

La `method` est la méthode HTTP à utiliser pour la requête. La méthode par défaut est `GET`.

### `baseURL`

La `baseURL` est l'URL de base à ajouter en préfixe à l'`url`, sauf si celle-ci est une URL absolue. Utile pour effectuer des requêtes vers le même domaine sans avoir à répéter le nom de domaine et tout préfixe d'API ou de version.

### `allowAbsoluteUrls`

`allowAbsoluteUrls` détermine si les URLs absolues peuvent remplacer une `baseUrl` configurée. Lorsqu'elle est définie à `true` (valeur par défaut), les valeurs absolues de `url` remplacent `baseUrl`. Lorsqu'elle est définie à `false`, les valeurs absolues de `url` sont toujours précédées de `baseUrl`.

### `transformRequest`

La fonction `transformRequest` vous permet de modifier les données de la requête avant leur envoi au serveur. Cette fonction est appelée avec les données de la requête comme seul argument. Elle ne s'applique que pour les méthodes de requête `PUT`, `POST`, `PATCH` et `DELETE`. La dernière fonction du tableau doit retourner une chaîne ou une instance de Buffer, ArrayBuffer, FormData ou Stream.

### `transformResponse`

La fonction `transformResponse` vous permet de modifier les données de la réponse avant qu'elles ne soient transmises aux fonctions `then` ou `catch`. Cette fonction est appelée avec les données de la réponse comme seul argument.

### `parseReviver`

La fonction `parseReviver` vous permet de fournir une fonction « reviver » personnalisée directement à l'appel natif `JSON.parse()` utilisé par le `transformResponse` par défaut.

C'est particulièrement utile pour effectuer une hydratation de types haute performance (par exemple, convertir des chaînes ISO en objets `Temporal` ou `Date`) ou pour éviter une perte de précision lors de l'analyse.

Dans les environnements modernes (ES2023+), la fonction reviver reçoit un troisième argument `context`. Celui-ci donne accès au `source` JSON brut, permettant la conversion précise de grands entiers (BigInt) qui perdraient autrement en précision s'ils étaient analysés comme des nombres JavaScript standards.

> Remarque : `Temporal` n'est pas encore disponible dans tous les environnements. Envisagez l'utilisation d'un polyfill si nécessaire.

```js
const client = faxios.create({
  parseReviver: (key, value, context) => {
    // Exemple : analyse BigInt sans perte de précision
    if (typeof value === 'number' && context?.source) {
      const isInteger = Number.isInteger(value);
      const isUnsafe = !Number.isSafeInteger(value);
      const isValidIntegerString = /^-?\d+$/.test(context.source);

      if (isInteger && isUnsafe && isValidIntegerString) {
        try {
          return BigInt(context.source);
        } catch {
          // Solution de repli : retourne la valeur d'origine si l'analyse échoue
        }
      }
    }

    // Exemple : hydratation des dates en objets Temporal
    if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      typeof Temporal !== 'undefined' &&
      Temporal?.PlainDate
    ) {
      return Temporal.PlainDate.from(value);
    }

    return value;
  },
});
```

### `headers`

Les `headers` sont les en-têtes HTTP à envoyer avec la requête. L'en-tête `Content-Type` est défini à `application/json` par défaut.

### `params`

Les `params` sont les paramètres d'URL à envoyer avec la requête. Il doit s'agir d'un objet simple ou d'un objet URLSearchParams. Si l'`url` contient des paramètres de requête, ils seront fusionnés avec l'objet `params`.

### `paramsSerializer`

La fonction `paramsSerializer` vous permet de sérialiser l'objet `params` avant son envoi au serveur. Plusieurs options sont disponibles pour cette fonction ; veuillez vous référer à l'exemple de configuration complète en bas de cette page.

#### Encodage pour-cent strict RFC 3986

Par défaut, faxios redécode `%3A`, `%24`, `%2C` et `%20` vers `:`, `$`, `,` et `+` pour la lisibilité (le `+` suit la convention `application/x-www-form-urlencoded` pour représenter une espace dans une chaîne de requête). Ces caractères sont valides dans un composant de requête selon la [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986#section-3.4), donc la sortie par défaut est correcte. Cependant, certains backends exigent un encodage pour-cent strict et rejettent la forme lisible.

Utilisez l'option `encode` pour remplacer l'encodeur par défaut :

```js
// Par requête : émettre un encodage pour-cent strict RFC 3986 pour les valeurs de requête
faxios.get('/foo', {
  params: { filter: JSON.stringify({ startedAt: '2026-01-23' }) },
  paramsSerializer: { encode: encodeURIComponent }
});

// Ou définir cela sur les valeurs par défaut de l'instance
const client = faxios.create({
  paramsSerializer: { encode: encodeURIComponent }
});
```

### `data`

Les `data` sont les données à envoyer comme corps de la requête. Il peut s'agir d'une chaîne, d'un objet simple, d'un ArrayBuffer, d'un FormData, d'un Blob ou d'un URLSearchParams. Ne s'applique que pour les méthodes de requête `PUT`, `POST`, `DELETE` et `PATCH`. Sans `transformRequest`, doit être de l'un des types suivants :

- chaîne, objet simple, ArrayBuffer, ArrayBufferView, URLSearchParams
- FormData, File, Blob (disponibles dans tous les environnements pris en charge)

Pour les objets `FormData`, ne définissez pas manuellement `Content-Type` ; l'environnement ajoute lui-même la boundary multipart.

Si l'objet `FormData` est personnalisé ou n'est pas pleinement de confiance, définissez `formDataHeaderPolicy: 'content-only'` pour ne copier que `Content-Type` et `Content-Length`, et définissez explicitement tout autre en-tête de requête via la configuration `headers` de la requête.

### `formDataHeaderPolicy`

Contrôle la manière dont faxios copie les en-têtes retournés par la méthode `getHeaders()` d'un objet `FormData`, lorsqu'elle est présente. La valeur par défaut est `'legacy'`, qui copie tous les en-têtes retournés afin de préserver le comportement existant de la v1. Définissez `'content-only'` pour ne copier que `Content-Type` et `Content-Length` depuis `getHeaders()`.

### `timeout`

Le `timeout` est le nombre de millisecondes avant l'expiration de la requête. Si la requête dure plus longtemps que `timeout`, elle sera annulée.

### `withCredentials`

La propriété `withCredentials` indique si les requêtes Cross-site Access-Control doivent être effectuées avec des informations d'identification telles que des cookies, des en-têtes d'autorisation ou des certificats client TLS. La définition de `withCredentials` n'a aucun effet sur les requêtes du même site.

### `adapter`

`adapter` permet une gestion personnalisée des requêtes, ce qui facilite les tests. Retournez une promise et fournissez une réponse valide ; consultez [les adaptateurs](/pages/advanced/adapters) pour plus d'informations. Le seul adaptateur intégré est `fetch`, qui est aussi la valeur par défaut (`['fetch']`). Vous pouvez fournir :

- le nom `'fetch'`,
- une fonction d'adaptateur personnalisée,
- ou un tableau (par exemple `['fetch']`) ; faxios utilisera le premier pris en charge par l'environnement.

### `auth`

`auth` indique que l'authentification HTTP Basic doit être utilisée, et fournit les identifiants. Cela définira un en-tête `Authorization`, en écrasant tout en-tête `Authorization` personnalisé que vous auriez défini via `headers`. Si `auth` est omis, l'adaptateur fetch peut déduire les identifiants Basic depuis l'URL de requête, par exemple `https://user:pass@example.com` ; les identifiants encodés en pourcentage dans l'URL sont décodés, et `auth` prend toujours le dessus sur les identifiants intégrés à l'URL. Notez que seule l'authentification HTTP Basic est configurable via ce paramètre. Pour les tokens Bearer et similaires, utilisez plutôt des en-têtes `Authorization` personnalisés.

### `responseType`

Le `responseType` indique le type de données que le serveur retournera. Il peut s'agir de l'un des types suivants :

- arraybuffer
- document
- json
- text
- stream
- blob (navigateur uniquement)
- formdata (adaptateur fetch uniquement)

### `responseEncoding` <Badge type="warning" text="Node.js uniquement" />

Le `responseEncoding` indique l'encodage à utiliser pour décoder les réponses. Les options suivantes sont prises en charge :

- ascii
- ASCII
- ansi
- ANSI
- binary
- BINARY
- base64
- BASE64
- base64url
- BASE64URL
- hex
- HEX
- latin1
- LATIN1
- ucs-2
- UCS-2
- ucs2
- UCS2
- utf-8
- UTF-8
- utf8
- UTF8
- utf16le
- UTF16LE

::: tip
Remarque : ignoré pour un `responseType` de `stream` ou pour les requêtes côté client
:::

### `xsrfCookieName`

Le `xsrfCookieName` est le nom du cookie à utiliser comme valeur pour le token `XSRF`.

### `xsrfHeaderName`

Le `xsrfHeaderName` est le nom de l'en-tête à utiliser comme valeur pour le token `XSRF`.

### `withXSRFToken`

`withXSRFToken` contrôle si faxios lit le cookie XSRF et définit l'en-tête XSRF sur les requêtes du navigateur. Accepte :

- `undefined` _(par défaut)_ — définit l'en-tête XSRF uniquement pour les requêtes du même site (same-origin).
- `true` — définit toujours l'en-tête XSRF, y compris pour les requêtes cross-origin.
- `false` — ne définit jamais l'en-tête XSRF.
- `(config: InternalAxiosRequestConfig) => boolean | undefined` — un callback qui décide par requête, en recevant l'objet de configuration interne.

```ts
withXSRFToken: boolean | undefined | ((config: InternalAxiosRequestConfig) => boolean | undefined);
```

::: warning XSRF cross-origin et `withCredentials`
`withCredentials` contrôle si les requêtes cross-site incluent des informations d'identification (cookies, authentification HTTP). Dans les anciennes versions d'faxios, définir `withCredentials: true` provoquait implicitement l'envoi de l'en-tête XSRF pour les requêtes cross-origin. Les versions plus récentes d'faxios séparent ces préoccupations : pour autoriser l'envoi de l'en-tête XSRF sur des requêtes cross-origin, vous devez définir **à la fois** `withCredentials: true` et `withXSRFToken: true`.

```js
faxios.get('/user', { withCredentials: true, withXSRFToken: true });
```
:::

### `onDownloadProgress`

La fonction `onDownloadProgress` vous permet d'écouter la progression d'un téléchargement. (L'API `fetch` ne peut pas signaler la progression d'un envoi, donc `onUploadProgress` n'est pas pris en charge.)

### `maxContentLength`

La propriété `maxContentLength` définit la taille maximale de la réponse en octets. L'adaptateur fetch l'applique lorsque la longueur de la réponse est déclarée, lorsque le stream de réponse peut être suivi ou lorsque la taille de la réponse peut être déterminée.

> ⚠️ **Sécurité :** la valeur par défaut est `-1` (illimitée). Des réponses non bornées combinées à la décompression gzip/deflate/brotli/zstd rendent possible un déni de service par bombe de décompression.
> Définissez une limite explicite lorsque vous consommez des serveurs auxquels vous ne faites pas pleinement confiance.

### `maxBodyLength`

La propriété `maxBodyLength` définit la taille maximale du corps de requête en octets. L'adaptateur fetch l'applique lorsque la longueur du corps de requête peut être déterminée.

### `redact`

La propriété `redact` est un tableau optionnel de noms de clés de configuration à masquer lorsqu'une `FaxiosError` est sérialisée avec `toJSON()`. La correspondance est insensible à la casse et récursive sur l'ensemble de la configuration de requête sérialisée. Les valeurs correspondantes sont remplacées par `[REDACTED ****]`.

`redact` n'affecte que la sérialisation des erreurs. Elle ne modifie ni les données de la requête, ni les en-têtes, ni l'objet de configuration original.

```js
faxios.get('/user/12345', {
  headers: { Authorization: 'Bearer token' },
  auth: { username: 'me', password: 'secret' },
  redact: ['authorization', 'password']
}).catch((error) => {
  console.log(error.toJSON().config);
});
```

### `validateStatus`

La fonction `validateStatus` vous permet de remplacer la validation du code de statut par défaut. Par défaut, faxios rejette la promise si le code de statut n'est pas dans la plage 200-299. Vous pouvez remplacer ce comportement en fournissant une fonction `validateStatus` personnalisée. La fonction doit retourner `true` si le code de statut est dans la plage que vous souhaitez accepter.

### `cancelToken`

La propriété `cancelToken` vous permet de créer un token d'annulation pouvant être utilisé pour annuler la requête. Pour plus d'informations, consultez la documentation sur l'[annulation](/pages/advanced/cancellation).

### `signal`

La propriété `signal` vous permet de passer une instance d'`AbortSignal` à la requête. Cela vous permet d'annuler la requête en utilisant l'API `AbortController`.

### `transitional`

La propriété `transitional` vous permet d'activer ou de désactiver certaines fonctionnalités de transition. Les options suivantes sont disponibles :

- `silentJSONParsing` : Si défini à `true` _(par défaut)_, faxios ignore silencieusement les erreurs d'analyse JSON et définit `response.data` à `null` lorsque l'analyse échoue. Définissez à `false` pour lever une `SyntaxError` à la place.

  ::: tip Important
  Cette option ne prend effet que lorsque `responseType` est **explicitement** défini à `'json'`. Lorsque `responseType` est omis, faxios utilise `forcedJSONParsing` pour tenter l'analyse JSON et retourne silencieusement la chaîne brute en cas d'échec, indépendamment de ce paramètre. Pour qu'un JSON invalide lève une erreur, définissez les deux :

  ```js
  { responseType: 'json', transitional: { silentJSONParsing: false } }
  ```
  :::

- `forcedJSONParsing` : Force faxios à analyser la chaîne de réponse comme du JSON même si `responseType` n'est pas `'json'`.
- `clarifyTimeoutError` : Clarifie le message d'erreur lorsqu'une requête expire. Utile lors du débogage de problèmes de délai d'attente.
- `advertiseZstdAcceptEncoding` : Lorsqu'elle vaut `true`, faxios ajoute `zstd` à l'en-tête `Accept-Encoding` par défaut lorsque le runtime actuel prend en charge la décompression zstd.
- `legacyInterceptorReqResOrdering` : Lorsque défini à true, l'ordre hérité de traitement requête/réponse des intercepteurs sera utilisé.

### `env`

La propriété `env` vous permet de définir certaines options de configuration. Par exemple, la classe FormData qui est utilisée pour sérialiser automatiquement le payload en objet FormData.

- FormData: window?.FormData || global?.FormData

### `formSerializer`

L'option `formSerializer` vous permet de configurer comment les objets simples sont sérialisés en `multipart/form-data` lorsqu'ils sont utilisés comme `data` de requête. Options disponibles :

- `visitor` — fonction visiteur personnalisée appelée récursivement pour chaque valeur
- `dots` — utiliser la notation pointée au lieu de la notation entre crochets
- `metaTokens` — conserver les terminaisons spéciales de clé telles que `{}`
- `indexes` — contrôler le format des crochets pour les clés de tableau (`null` / `false` / `true`)
- `maxDepth` _(par défaut : `100`)_ — profondeur maximale d'imbrication avant de lever une `FaxiosError` avec le code `ERR_FORM_DATA_DEPTH_EXCEEDED`. Définir à `Infinity` pour désactiver.

Consultez la page [multipart/form-data](/pages/advanced/multipart-form-data-format) pour tous les détails, et l'exemple de configuration complète en bas de cette page.

## Exemple de configuration complète

```js
{
  url: "/posts",
  method: "get",
  baseURL: "https://jsonplaceholder.typicode.com",
  allowAbsoluteUrls: true,
  transformRequest: [function (data, headers) {
    return data;
  }],
  transformResponse: [function (data) {
    return data;
  }],
  headers: {"X-Requested-With": "XMLHttpRequest"},
  params: {
    postId: 5
  },
  paramsSerializer: {
    // Fonction d'encodage personnalisée qui envoie les paires clé/valeur de façon itérative.
    encode?: (param: string): string => { /* Effectuez des opérations personnalisées ici et retournez la chaîne transformée */ },

    // Fonction de sérialisation personnalisée pour l'ensemble du paramètre. Permet à l'utilisateur de reproduire le comportement antérieur à la v1.x.
    serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions ),

    // Configuration du format des index de tableaux dans les params.
    // Trois options disponibles :
      // (1) indexes: null (pas de crochets)
      // (2) (défaut) indexes: false (crochets vides)
      // (3) indexes: true (crochets avec index).
    indexes: false,

    // Profondeur maximale d'imbrication des objets lors de la sérialisation des params. Lève une FaxiosError
    // (ERR_FORM_DATA_DEPTH_EXCEEDED) si dépassée. Par défaut : 100. Définir à Infinity pour désactiver.
    maxDepth: 100

  },
  data: {
    firstName: "Fred"
  },
  formDataHeaderPolicy: "legacy",
  // Syntaxe alternative pour envoyer des données dans le corps de la méthode post : seule la valeur est envoyée, pas la clé
  data: "Country=Brasil&City=Belo Horizonte",
  timeout: 1000,
  withCredentials: false,
  adapter: function (config) {
    // Faites ce que vous voulez
  },
  adapter: "fetch",
  auth: {
    username: "janedoe",
    password: "s00pers3cret"
  },
  responseType: "json",
  responseEncoding: "utf8",
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  withXSRFToken: boolean | undefined | ((config: InternalAxiosRequestConfig) => boolean | undefined),
  onDownloadProgress: function ({loaded, total, progress, bytes, estimated, rate, download = true}) {
    // Faites ce que vous voulez avec l'événement de progression faxios
  },
  maxContentLength: 2000,
  maxBodyLength: 2000,
  redact: ['authorization', 'password'],
  validateStatus: function (status) {
    return status >= 200 && status < 300;
  },
  cancelToken: new CancelToken(function (cancel) {
    cancel("Operation has been canceled.");
  }),
  signal: new AbortController().signal,
  transitional: {
    silentJSONParsing: true,
    forcedJSONParsing: true,
    clarifyTimeoutError: false,
    advertiseZstdAcceptEncoding: false,
    legacyInterceptorReqResOrdering: true,
  },
  env: {
    FormData: window?.FormData || global?.FormData
  },
  formSerializer: {
      // Fonction visiteur personnalisée pour sérialiser les valeurs du formulaire
      visitor: (value, key, path, helpers) => {};

      // Utiliser des points au lieu de crochets
      dots: boolean;

      // Conserver les terminaisons spéciales comme {} dans la clé de paramètre
      metaTokens: boolean;

      // Utiliser le format des index de tableau :
        // null - pas de crochets
        // false - crochets vides
        // true - crochets avec index
      indexes: boolean;

      // Profondeur maximale d'imbrication des objets. Lève une FaxiosError (ERR_FORM_DATA_DEPTH_EXCEEDED)
      // si dépassée. Par défaut : 100. Définir à Infinity pour désactiver.
      maxDepth: 100;
  }
}
```
