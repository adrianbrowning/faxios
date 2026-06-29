# Adaptateurs

Les adaptateurs vous permettent de personnaliser la façon dont faxios gère les données de la requête. Par défaut, faxios utilise la liste `['fetch']` : l'adaptateur `fetch`, basé sur l'API web standard, est le seul adaptateur intégré et fonctionne dans tous les environnements (navigateurs, Node.js 18+, Deno et Bun).

Écrire votre propre adaptateur vous donne un contrôle total sur la façon dont faxios effectue une requête et traite la réponse — utile pour les tests, les transports personnalisés ou les environnements non standard.

## Adaptateurs intégrés

Le seul adaptateur intégré est `fetch`. Vous pouvez le sélectionner explicitement par nom en utilisant l'option de configuration `adapter` :

```js
// Utiliser l'adaptateur fetch (par défaut)
const instance = faxios.create({ adapter: "fetch" });
```

Vous pouvez également passer un tableau de noms d'adaptateurs. La valeur par défaut est `['fetch']` :

```js
const instance = faxios.create({ adapter: ["fetch"] });
```

Les fonctions d'adaptateur personnalisées restent prises en charge (voir ci-dessous).

Pour plus de détails sur l'adaptateur `fetch`, consultez la page [Adaptateur Fetch](/pages/advanced/fetch-adapter).

## Créer un adaptateur personnalisé

Pour créer un adaptateur personnalisé, écrivez une fonction qui accepte un objet `config` et retourne une Promise qui se résout vers un objet de réponse faxios valide.

```js
import faxios from "faxios";
import { settle } from "faxios/unsafe/core/settle.js";

function myAdapter(config) {
  /**
   * À ce stade :
   * - la configuration a été fusionnée avec les valeurs par défaut
   * - les transformateurs de requête ont été exécutés
   * - les intercepteurs de requête ont été exécutés
   *
   * L'adaptateur est maintenant responsable de l'exécution de la requête
   * et du retour d'un objet de réponse valide.
   */

  return new Promise((resolve, reject) => {
    // Effectuez votre logique de requête personnalisée ici.
    // Cet exemple utilise l'API native fetch comme point de départ.
    fetch(config.url, {
      method: config.method?.toUpperCase() ?? "GET",
      headers: config.headers?.toJSON() ?? {},
      body: config.data,
      signal: config.signal,
    })
      .then(async (fetchResponse) => {
        const responseData = await fetchResponse.text();

        const response = {
          data: responseData,
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          headers: Object.fromEntries(fetchResponse.headers.entries()),
          config,
          request: null,
        };

        // settle résout ou rejette la promise selon le statut HTTP
        settle(resolve, reject, response);

        /**
         * Après ce point :
         * - les transformateurs de réponse seront exécutés
         * - les intercepteurs de réponse seront exécutés
         */
      })
      .catch(reject);
  });
}

const instance = faxios.create({ adapter: myAdapter });
```

::: tip
Le helper `settle` résout la promise pour les codes de statut 2xx et la rejette pour tout le reste, conformément au comportement par défaut d'faxios. Si vous souhaitez une validation de statut personnalisée, utilisez plutôt l'option de configuration `validateStatus`.
:::
