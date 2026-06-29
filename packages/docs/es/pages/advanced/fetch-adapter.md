# Adaptador Fetch <Badge type="tip" text="Nuevo" />

El adaptador `fetch` está construido sobre la API web estándar `fetch` y es el único adaptador de transporte de faxios. Se usa en todos los entornos: navegadores, Node.js 18+, Deno y Bun. Es el adaptador predeterminado, por lo que normalmente no necesitas seleccionarlo, pero puedes hacerlo explícitamente:

```js
import faxios from 'faxios';

const instance = faxios.create({
  adapter: 'fetch',
});
```

El adaptador admite la captura del progreso de descarga (`onDownloadProgress`). El progreso de carga (`onUploadProgress`) no está disponible, porque la API `fetch` no puede emitir eventos de progreso de carga. También admite tipos de respuesta adicionales como `stream` y `formdata` (si el entorno lo soporta).

Para configurar proxies o agentes/dispatchers personalizados, usa `fetchOptions` o el dispatcher del entorno de ejecución (por ejemplo, `undici` en Node.js), ya que faxios ya no gestiona proxies ni agentes directamente.

Cuando `auth` se omite, el adaptador fetch puede leer credenciales de autenticación HTTP Basic desde la URL de la solicitud, por ejemplo `https://user:pass@example.com`. Las credenciales de URL codificadas con porcentaje se decodifican antes de generar el encabezado `Authorization`, y `auth` tiene prioridad sobre las credenciales incluidas en la URL.

## Fetch personalizado <Badge type="tip" text="v1.12.0+" />

A partir de `v1.12.0`, puedes personalizar el adaptador fetch para que use una función `fetch` personalizada en lugar de la global del entorno. Puedes pasar una función `fetch` personalizada, y los constructores `Request` y `Response` a través de la opción de configuración `env`. Esto es útil cuando trabajas con entornos personalizados o frameworks de aplicación que proporcionan su propia implementación de `fetch`.

::: info
Al usar una función `fetch` personalizada, es posible que también necesites proporcionar constructores `Request` y `Response` correspondientes. Si los omites, se usarán los constructores globales. Si tu `fetch` personalizado es incompatible con los globales, pasa `null` para deshabilitarlos.

**Nota:** Establecer `Request` y `Response` en `null` hará imposible que el adaptador fetch capture el progreso de carga y descarga.
:::

### Ejemplo básico

```js
import customFetchFunction from 'customFetchModule';

const instance = faxios.create({
  adapter: 'fetch',
  onDownloadProgress(e) {
    console.log('downloadProgress', e);
  },
  env: {
    fetch: customFetchFunction,
    Request: null, // null -> disable the constructor
    Response: null,
  },
});
```

### Usando con Tauri

[Tauri](https://tauri.app/plugin/http-client/) proporciona una función `fetch` de plataforma que omite las restricciones CORS del navegador para las solicitudes realizadas desde la capa nativa. El ejemplo a continuación muestra una configuración mínima para usar faxios dentro de una aplicación Tauri con ese fetch personalizado.

```js
import { fetch } from '@tauri-apps/plugin-http';
import faxios from 'faxios';

const instance = faxios.create({
  adapter: 'fetch',
  onDownloadProgress(e) {
    console.log('downloadProgress', e);
  },
  env: {
    fetch,
  },
});

const { data } = await instance.get('https://google.com');
```

### Usando con SvelteKit

[SvelteKit](https://svelte.dev/docs/kit/web-standards#Fetch-APIs) proporciona una implementación personalizada de `fetch` para las funciones `load` del lado del servidor que gestiona el reenvío de cookies y URLs relativas. Dado que su `fetch` es incompatible con la API estándar de `URL`, faxios debe configurarse para usarlo explícitamente, y los constructores globales `Request` y `Response` deben deshabilitarse.

```js
export async function load({ fetch }) {
  const { data: post } = await faxios.get('https://jsonplaceholder.typicode.com/posts/1', {
    adapter: 'fetch',
    env: {
      fetch,
      Request: null,
      Response: null,
    },
  });

  return { post };
}
```
