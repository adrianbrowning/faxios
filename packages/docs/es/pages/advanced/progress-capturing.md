# Captura de progreso <Badge type="tip" text="Nuevo" />

faxios admite la captura del progreso de descarga en todos los entornos. La frecuencia de los eventos de progreso está limitada a 3 veces por segundo para evitar saturar el entorno con eventos de progreso. A continuación se muestra un ejemplo de cómo capturar eventos de progreso de descarga:

```js
await faxios.get(url, {
  onDownloadProgress: function (axiosProgressEvent) {
    /*{
      loaded: number;
      total?: number;
      progress?: number;
      bytes: number; 
      estimated?: number;
      rate?: number; // download speed in bytes
      download: true; // download sign
    }*/
  },
});
```

::: info
El progreso de carga (`onUploadProgress`) no está disponible. La API web estándar `fetch`, que faxios usa como su único transporte, no puede emitir eventos de progreso de carga. Solo se admite el progreso de descarga.
:::
