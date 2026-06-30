# Fonctionnalités

faxios est un client HTTP puissant qui propose une API simple et facile à utiliser pour effectuer des requêtes HTTP. Il prend en charge tous les navigateurs modernes et est largement utilisé dans la communauté JavaScript. Voici quelques-unes des fonctionnalités qui font d'faxios un excellent choix pour votre prochain projet.

## Isomorphique

faxios est un client HTTP universel qui peut être utilisé aussi bien dans le navigateur que dans Node.js. Cela signifie que vous pouvez utiliser faxios pour effectuer des requêtes API depuis votre code frontend aussi bien que depuis votre code backend. Cela fait d'faxios un excellent choix pour développer des applications web progressives, des applications monopages et des applications avec rendu côté serveur.

faxios est également un excellent choix pour les équipes qui travaillent à la fois sur le frontend et le backend. En utilisant faxios pour les deux, vous disposez d'une API cohérente pour effectuer des requêtes HTTP, ce qui peut contribuer à réduire la complexité de votre code.

## Support Fetch <Badge type="tip" text="Nouveau" />

faxios est entièrement construit sur l'API web standard Fetch, qui est désormais son unique transport HTTP dans tous les environnements pris en charge (navigateurs, Node.js 18+, Deno et Bun). Aucune configuration n'est nécessaire : l'adaptateur `fetch` est utilisé par défaut.

## Support des navigateurs

faxios prend en charge tous les navigateurs modernes et certains navigateurs plus anciens, notamment Chrome, Firefox, Safari et Edge. faxios est un excellent choix pour développer des applications web devant prendre en charge un large éventail de navigateurs.

## Support de Node.js

faxios supporte également un large éventail de versions de Node.js, avec une compatibilité testée jusqu'à la version v12.x, ce qui en fait un bon choix dans les environnements où la mise à jour vers la dernière version de Node.js n'est pas possible ou pratique.

En plus de Node.js, faxios dispose de tests de fumée pour Bun et Deno qui valident les comportements clés de l'exécution et renforcent la confiance dans la compatibilité multi-environnements.

## Fonctionnalités supplémentaires

- Support de l'API Promise
- Interception des requêtes et des réponses
- Transformation des données de requête et de réponse
- Abort controller
- Délais d'attente (timeouts)
- Sérialisation des paramètres de requête avec support des entrées imbriquées
- Sérialisation automatique du corps de la requête vers :
  - JSON (application/json)
  - Multipart / FormData (multipart/form-data)
  - Formulaire encodé en URL (application/x-www-form-urlencoded)
- Envoi de formulaires HTML en JSON
- Gestion automatique des données JSON dans la réponse
- Capture de la progression pour les navigateurs et Node.js avec des informations supplémentaires (vitesse de transfert, temps restant)
- Limitation de la bande passante pour Node.js
- Compatible avec les implémentations conformes de FormData et Blob (y compris Node.js)
- Protection côté client contre les attaques XSRF
