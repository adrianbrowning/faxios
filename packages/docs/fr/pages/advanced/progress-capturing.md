# Capture de progression <Badge type="tip" text="Nouveau" />

faxios prend en charge la capture de la progression des téléchargements dans tous les environnements pris en charge. La fréquence des événements de progression est limitée à 3 fois par seconde. Cela permet d'éviter de surcharger le navigateur avec des événements de progression. Voici un exemple de capture d'événements de progression :

```js
await faxios.get(url, {
  onDownloadProgress: function (axiosProgressEvent) {
    /*{
      loaded: number;
      total?: number;
      progress?: number;
      bytes: number; 
      estimated?: number;
      rate?: number; // vitesse de téléchargement en octets
      download: true; // indicateur de téléchargement
    }*/
  },
});
```

::: info
L'API `fetch` ne peut pas signaler la progression d'un envoi, donc `onUploadProgress` n'est pas pris en charge. Seule la progression des téléchargements (`onDownloadProgress`) est disponible.
:::
