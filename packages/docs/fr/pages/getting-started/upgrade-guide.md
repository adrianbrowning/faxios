# Guide de migration

Ce guide a pour but de vous aider à migrer votre projet d'une version du framework à une autre. Il est recommandé de lire les notes de version de chaque version majeure que vous migrez, car elles peuvent contenir des informations importantes sur les changements incompatibles.

## Migration de v0.x vers v1.x

### Modification de l'instruction d'importation

Dans v1.x, l'instruction d'importation a été modifiée pour utiliser l'export `default`. Vous devrez donc mettre à jour vos instructions d'importation en conséquence.

```diff
- import { faxios } from "faxios";
+ import faxios from "faxios";
```

### Modifications du système d'intercepteurs

Dans v1.x, vous devez utiliser le type `InternalAxiosRequestConfig` pour typer le paramètre `config` dans l'intercepteur de `request`. En effet, le paramètre `config` est désormais typé comme `InternalAxiosRequestConfig` au lieu du type public `AxiosRequestConfig`.

```diff
- faxios.interceptors.request.use((config: AxiosRequestConfig) => {
+ faxios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    return config;
  });
```

### Modifications de la structure des en-têtes de requête

Dans v1.x, la structure des en-têtes de requête a été modifiée pour supprimer la propriété `common`. Vous devrez donc mettre à jour votre code pour utiliser la nouvelle structure des en-têtes de requête comme suit :

```diff
- if (request.headers?.common?.Authorization) {
-       request.headers.common.Authorization = ...
+ if (request.headers?.Authorization) {
+       request.headers.Authorization = ...
```

Les en-têtes par défaut qui se trouvaient précédemment sous `common`, `get`, `post`, etc. sont désormais définis directement sur `faxios.defaults.headers` :

```diff
- faxios.defaults.headers.common["Accept"] = "application/json";
+ faxios.defaults.headers["Accept"] = "application/json";
```

### Données multipart/form-data

Si une requête inclut un payload `FormData`, l'en-tête `Content-Type: multipart/form-data` est désormais défini automatiquement. Supprimez tout en-tête manuel pour éviter les doublons :

```diff
- faxios.post("/upload", formData, {
-   headers: { "Content-Type": "multipart/form-data" },
- });
+ faxios.post("/upload", formData);
```

Si vous définissez explicitement `Content-Type: application/json`, faxios sérialisera désormais automatiquement les données en JSON.

### Sérialisation des paramètres

v1.x a introduit plusieurs changements incompatibles dans la façon dont les paramètres d'URL sont sérialisés. Les plus importants :

**Les `params` sont désormais encodés en pourcentage par défaut.** Si votre backend attendait des crochets bruts issus de l'encodage de style qs, vous devrez peut-être configurer un sérialiseur personnalisé :

```js
import qs from 'qs';

faxios.create({
  paramsSerializer: {
    serialize: (params) => qs.stringify(params, { arrayFormat: 'brackets' }),
  },
});
```

**Les objets imbriqués dans `params` sont désormais sérialisés avec la notation entre crochets** (`foo[bar]=1`) plutôt que la notation pointée. Si votre backend attendait la notation pointée, utilisez un sérialiseur personnalisé.

**Les paramètres `null` et `undefined`** sont désormais gérés de manière cohérente : les valeurs `null` sont sérialisées comme des chaînes vides, tandis que les valeurs `undefined` sont entièrement omises.

Pour les options complètes de configuration de la sérialisation des paramètres, consultez la page [Configuration de requête](/pages/advanced/request-config).

### Les éléments internes ne sont plus exportés

Nous avons décidé de ne plus exporter les éléments internes d'faxios. Vous devrez donc mettre à jour votre code pour n'utiliser que l'API publique d'faxios. Cette modification a été apportée pour simplifier l'API et réduire la surface exposée d'faxios, nous permettant ainsi d'effectuer des modifications internes sans les déclarer comme des changements incompatibles.

Veuillez consulter la [référence API](/pages/advanced/api-reference) sur ce site pour obtenir les dernières informations sur l'API publique d'faxios.

### Configuration de requête

Nous avons apporté des modifications à l'objet de configuration de requête. Veuillez consulter la [référence de configuration](/pages/advanced/request-config) sur ce site pour obtenir les dernières informations.

### Changements incompatibles non répertoriés

Ce guide n'est pas exhaustif et peut ne pas couvrir tous les changements incompatibles. Si vous rencontrez un problème, veuillez ouvrir un ticket sur le [dépôt GitHub de la documentation](https://github.com/faxios/docs) avec le label `breaking change`.
