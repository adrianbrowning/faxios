# Configuración de solicitud

La configuración de solicitud se usa para configurar la solicitud. Existe una amplia gama de opciones disponibles, pero la única opción requerida es `url`. Si el objeto de configuración no contiene un campo `method`, el método predeterminado es `GET`.

::: warning Seguridad: la protección contra bombas de descompresión es opcional
Por defecto, `maxContentLength` y `maxBodyLength` están en `-1` (sin límite). Un servidor malicioso o comprometido puede devolver un cuerpo pequeño comprimido con gzip/deflate/brotli/zstd que se expande a gigabytes y agota el proceso.

Si haces solicitudes a servidores en los que no confías plenamente, **establece un tope**:

```js
faxios.defaults.maxContentLength = 10 * 1024 * 1024; // 10 MB
faxios.defaults.maxBodyLength = 10 * 1024 * 1024;
```

Consulta la [guía de seguridad](/pages/misc/security) para más detalles.
:::

### `url`

La `url` es la URL a la que se realiza la solicitud. Puede ser una cadena de texto o una instancia de `URL`.

### `method`

El `method` es el método HTTP a usar para la solicitud. El método predeterminado es `GET`.

### `baseURL`

La `baseURL` es la URL base que se antepondrá a la `url` a menos que la `url` sea una URL absoluta. Es útil para hacer solicitudes al mismo dominio sin tener que repetir el nombre de dominio, ni ningún prefijo de API o versión.

### `allowAbsoluteUrls`

`allowAbsoluteUrls` determina si las URLs absolutas sobrescribirán un `baseUrl` configurado. Cuando se establece en `true` (valor predeterminado), los valores absolutos para `url` sobrescribirán `baseUrl`. Cuando se establece en `false`, los valores absolutos para `url` siempre serán antepuestos por `baseUrl`.

### `transformRequest`

La función `transformRequest` te permite modificar los datos de la solicitud antes de enviarlos al servidor. Esta función se llama con los datos de la solicitud como único argumento. Solo aplica para los métodos de solicitud `PUT`, `POST`, `PATCH` y `DELETE`. La última función del arreglo debe devolver una cadena de texto o una instancia de Buffer, ArrayBuffer, FormData o Stream.

### `transformResponse`

La función `transformResponse` te permite modificar los datos de la respuesta antes de que sean pasados a las funciones `then` o `catch`. Esta función se llama con los datos de la respuesta como único argumento.

### `parseReviver`

La función `parseReviver` te permite proporcionar una función "reviver" personalizada directamente a la llamada nativa `JSON.parse()` que utiliza el `transformResponse` predeterminado.

Esto resulta especialmente útil para realizar hidratación de tipos de alto rendimiento (por ejemplo, convertir cadenas ISO a objetos `Temporal` o `Date`) o para evitar la pérdida de precisión durante el parseo.

En entornos modernos (ES2023+), la función reviver recibe un tercer argumento `context`. Esto proporciona acceso a la fuente JSON cruda (`source`), permitiendo la conversión precisa de enteros grandes (BigInt) que de otro modo perderían precisión al ser parseados como números estándar de JavaScript.

> Nota: `Temporal` aún no está disponible en todos los entornos. Considera usar un polyfill si es necesario.

```js
const client = faxios.create({
  parseReviver: (key, value, context) => {
    // Ejemplo: parseo de BigInt seguro en precisión
    if (typeof value === 'number' && context?.source) {
      const isInteger = Number.isInteger(value);
      const isUnsafe = !Number.isSafeInteger(value);
      const isValidIntegerString = /^-?\d+$/.test(context.source);

      if (isInteger && isUnsafe && isValidIntegerString) {
        try {
          return BigInt(context.source);
        } catch {
          // Alternativa: devolver el valor original si el parseo falla
        }
      }
    }

    // Ejemplo: hidratar fechas en objetos Temporal
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

Los `headers` son los encabezados HTTP que se enviarán con la solicitud. El encabezado `Content-Type` se establece en `application/json` de forma predeterminada.

### `params`

Los `params` son los parámetros de URL que se enviarán con la solicitud. Debe ser un objeto plano o un objeto URLSearchParams. Si la `url` contiene parámetros de consulta, se combinarán con el objeto `params`.

### `paramsSerializer`

La función `paramsSerializer` te permite serializar el objeto `params` antes de enviarlo al servidor. Hay varias opciones disponibles para esta función; consulta el ejemplo completo de configuración de solicitud al final de esta página.

#### Codificación porcentual estricta RFC 3986

De forma predeterminada, faxios decodifica `%3A`, `%24`, `%2C` y `%20` de vuelta a `:`, `$`, `,` y `+` por legibilidad (el `+` sigue la convención `application/x-www-form-urlencoded` para representar un espacio en una cadena de consulta). Estos caracteres son válidos dentro de un componente de consulta según la [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986#section-3.4), por lo que la salida predeterminada es correcta. Sin embargo, algunos backends requieren codificación porcentual estricta y rechazan la forma legible.

Usa la opción `encode` para sobrescribir el codificador predeterminado:

```js
// Por solicitud: emitir codificación porcentual estricta RFC 3986 para los valores de consulta
faxios.get('/foo', {
  params: { filter: JSON.stringify({ startedAt: '2026-01-23' }) },
  paramsSerializer: { encode: encodeURIComponent }
});

// O establecerlo en los valores predeterminados de la instancia
const client = faxios.create({
  paramsSerializer: { encode: encodeURIComponent }
});
```

### `data`

El `data` son los datos que se enviarán como cuerpo de la solicitud. Puede ser una cadena de texto, un objeto plano, un Buffer, ArrayBuffer, FormData, Stream o URLSearchParams. Solo aplica para los métodos de solicitud `PUT`, `POST`, `DELETE` y `PATCH`. Cuando no se establece `transformRequest`, debe ser de uno de los siguientes tipos:

- cadena de texto, objeto plano, ArrayBuffer, ArrayBufferView, URLSearchParams
- FormData, File, Blob (disponibles en todos los entornos compatibles)
- ReadableStream

Para `FormData`, no establezcas manualmente `Content-Type`; el entorno agrega el boundary multipart.

Si un objeto similar a `FormData` proporciona un método `getHeaders()`, faxios copia por defecto todos los encabezados devueltos para mantener la compatibilidad con v1. Si el objeto es personalizado o no es de plena confianza, establece `formDataHeaderPolicy: 'content-only'` para copiar únicamente `Content-Type` y `Content-Length`, y define cualquier otro encabezado de la solicitud explícitamente mediante la configuración `headers`.

### `formDataHeaderPolicy` <Badge type="warning" text="Solo en Node.js" />

Controla cómo faxios copia los encabezados devueltos por `FormData#getHeaders()` de Node.js. El valor por defecto es `'legacy'`, que copia todos los encabezados devueltos para preservar el comportamiento existente de v1. Establece `'content-only'` para copiar únicamente `Content-Type` y `Content-Length` desde `getHeaders()`.

### `timeout`

El `timeout` es el número de milisegundos antes de que la solicitud expire. Si la solicitud tarda más que `timeout`, se abortará.

### `withCredentials`

La propiedad `withCredentials` indica si las solicitudes de Access-Control entre sitios deben hacerse usando credenciales como cookies, encabezados de autorización o certificados de cliente TLS. Establecer `withCredentials` no tiene efecto en solicitudes del mismo sitio.

### `adapter`

`adapter` permite el manejo personalizado de solicitudes, lo que facilita las pruebas. Devuelve una Promise y proporciona una respuesta válida; consulta los [adaptadores](/pages/advanced/adapters) para más información. El único adaptador integrado es `'fetch'`, y el valor predeterminado es `['fetch']`. También puedes pasar tu propia función adaptadora personalizada, o un arreglo de adaptadores: faxios usará el primero que sea compatible con el entorno.

### `auth`

`auth` indica que se debe usar autenticación HTTP Basic y proporciona las credenciales. Esto establecerá un encabezado `Authorization`, sobrescribiendo cualquier encabezado `Authorization` personalizado que hayas definido usando `headers`. Si `auth` se omite, el adaptador fetch puede obtener credenciales Basic desde la URL de la solicitud, por ejemplo `https://user:pass@example.com`; las credenciales codificadas con porcentaje en la URL se decodifican, y `auth` siempre tiene prioridad sobre las credenciales incluidas en la URL. Ten en cuenta que solo la autenticación HTTP Basic es configurable a través de este parámetro. Para tokens Bearer y similares, usa encabezados `Authorization` personalizados.

### `responseType`

El `responseType` indica el tipo de datos con el que el servidor responderá. Puede ser uno de los siguientes:

- arraybuffer
- document
- json
- text
- stream
- blob (solo en el navegador)
- formdata (solo con el adaptador fetch)

### `responseEncoding` <Badge type="warning" text="Solo en Node.js" />

El `responseEncoding` indica la codificación a usar para decodificar las respuestas. Se admiten las siguientes opciones:

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
Nota: Se ignora para `responseType` de tipo `stream` o solicitudes del lado del cliente.
:::

### `xsrfCookieName`

`xsrfCookieName` es el nombre de la cookie que se usará como valor para el token `XSRF`.

### `xsrfHeaderName`

`xsrfHeaderName` es el nombre del encabezado que se usará como valor para el token `XSRF`.

### `withXSRFToken`

`withXSRFToken` controla si faxios lee la cookie XSRF y establece el encabezado XSRF en las solicitudes del navegador. Acepta:

- `undefined` _(predeterminado)_ — establece el encabezado XSRF solo para solicitudes del mismo origen.
- `true` — siempre establece el encabezado XSRF, incluso para solicitudes de origen cruzado.
- `false` — nunca establece el encabezado XSRF.
- `(config: InternalAxiosRequestConfig) => boolean | undefined` — un callback que decide por solicitud, recibiendo el objeto de configuración interna.

```ts
withXSRFToken: boolean | undefined | ((config: InternalAxiosRequestConfig) => boolean | undefined);
```

::: warning XSRF de origen cruzado y `withCredentials`
`withCredentials` controla si las solicitudes de origen cruzado incluyen credenciales (cookies, autenticación HTTP). En versiones anteriores de faxios, establecer `withCredentials: true` provocaba implícitamente que faxios estableciera el encabezado XSRF para solicitudes de origen cruzado. Las versiones más recientes de faxios separan estas responsabilidades: para permitir que el encabezado XSRF se envíe en solicitudes de origen cruzado debes establecer **ambos** `withCredentials: true` y `withXSRFToken: true`.

```js
faxios.get('/user', { withCredentials: true, withXSRFToken: true });
```
:::

### `onDownloadProgress`

La función `onDownloadProgress` te permite escuchar el progreso de una descarga.

### `maxContentLength`

La propiedad `maxContentLength` define el tamaño máximo de la respuesta en bytes. El adaptador fetch lo aplica cuando la longitud de la respuesta está declarada, se puede rastrear el stream de respuesta o se puede determinar el tamaño de la respuesta.

> ⚠️ **Seguridad:** el valor por defecto es `-1` (sin límite). Las respuestas sin límite combinadas con la descompresión gzip/deflate/brotli/zstd permiten ataques de denegación de servicio por bomba de descompresión.
> Establece un límite explícito al consumir servidores en los que no confíes plenamente.

### `maxBodyLength`

La propiedad `maxBodyLength` define el tamaño máximo del cuerpo de la solicitud en bytes. El adaptador fetch lo aplica cuando se puede determinar la longitud del cuerpo de la solicitud.

### `redact`

La propiedad `redact` es un arreglo opcional de nombres de claves de configuración que se enmascararán cuando un `FaxiosError` se serialice con `toJSON()`. La coincidencia es insensible a mayúsculas/minúsculas y recursiva a lo largo de la configuración de la solicitud serializada. Los valores coincidentes se reemplazan por `[REDACTED ****]`.

`redact` solo afecta a la serialización del error. No modifica los datos de la solicitud, los encabezados ni el objeto de configuración original.

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

La función `validateStatus` te permite sobreescribir la validación predeterminada del código de estado. Por defecto, faxios rechazará la Promise si el código de estado no está en el rango 200-299. Puedes sobreescribir este comportamiento proporcionando una función `validateStatus` personalizada. La función debe devolver `true` si el código de estado está dentro del rango que deseas aceptar.

### `cancelToken`

La propiedad `cancelToken` te permite crear un token de cancelación que puede usarse para cancelar la solicitud. Para más información, consulta la documentación de [cancelación](/pages/advanced/cancellation).

### `signal`

La propiedad `signal` te permite pasar una instancia de `AbortSignal` a la solicitud. Esto te permite cancelar la solicitud usando la API `AbortController`.

### `transitional`

La propiedad `transitional` te permite habilitar o deshabilitar ciertas características de transición. Las siguientes opciones están disponibles:

- `silentJSONParsing`: Si se establece en `true` _(predeterminado)_, faxios ignora silenciosamente los errores de parseo de JSON y establece `response.data` en `null` cuando el parseo falla. Establécelo en `false` para que se lance `SyntaxError` en su lugar.

  ::: tip Importante
  Esta opción solo tiene efecto cuando `responseType` se establece **explícitamente** en `'json'`. Cuando `responseType` se omite, faxios usa `forcedJSONParsing` para intentar el parseo de JSON y devuelve silenciosamente la cadena cruda en caso de fallo, sin importar este ajuste. Para hacer que el JSON inválido lance un error, establece ambos:

  ```js
  { responseType: 'json', transitional: { silentJSONParsing: false } }
  ```
  :::

- `forcedJSONParsing`: Fuerza a faxios a analizar la cadena de respuesta como JSON incluso si `responseType` no es `'json'`.
- `clarifyTimeoutError`: Clarifica el mensaje de error cuando una solicitud expira. Es útil cuando depuras problemas de timeout.
- `advertiseZstdAcceptEncoding`: Cuando se establece en `true`, faxios añade `zstd` al encabezado `Accept-Encoding` predeterminado cuando el runtime actual soporta descompresión zstd.
- `legacyInterceptorReqResOrdering`: Cuando se establece en `true`, se usará el orden de solicitud/respuesta de interceptores heredado.

### `env`

La propiedad `env` te permite establecer algunas opciones de configuración. Por ejemplo, la clase FormData que se usa para serializar automáticamente el payload en un objeto FormData.

- FormData: window?.FormData || global?.FormData

### `formSerializer`

La opción `formSerializer` te permite configurar cómo se serializan los objetos planos a `multipart/form-data` cuando se usan como `data` de solicitud. Opciones disponibles:

- `visitor` — función visitante personalizada llamada recursivamente para cada valor
- `dots` — usar notación de punto en lugar de notación de corchetes
- `metaTokens` — preservar terminaciones especiales de clave como `{}`
- `indexes` — controlar el formato de corchetes para claves de arreglo (`null` / `false` / `true`)
- `maxDepth` _(predeterminado: `100`)_ — profundidad máxima de anidación antes de lanzar un `FaxiosError` con código `ERR_FORM_DATA_DEPTH_EXCEEDED`. Establece en `Infinity` para desactivar.

Consulta la página [multipart/form-data](/pages/advanced/multipart-form-data-format) para todos los detalles, y el ejemplo completo de configuración de solicitud al final de esta página.

## Ejemplo completo de configuración de solicitud

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
    // Custom encoder function which sends key/value pairs in an iterative fashion.
    encode?: (param: string): string => { /* Do custom operations here and return transformed string */ },

    // Custom serializer function for the entire parameter. Allows user to mimic pre 1.x behaviour.
    serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions ),

    // Configuration for formatting array indexes in the params.
    // Three available options:
      // (1) indexes: null (leads to no brackets)
      // (2) (default) indexes: false (leads to empty brackets)
      // (3) indexes: true (leads to brackets with indexes).
    indexes: false,

    // Profundidad máxima de anidación de objetos al serializar params. Lanza FaxiosError
    // (ERR_FORM_DATA_DEPTH_EXCEEDED) si se excede. Predeterminado: 100. Establecer en Infinity para desactivar.
    maxDepth: 100

  },
  data: {
    firstName: "Fred"
  },
  formDataHeaderPolicy: "legacy",
  // Syntax alternative to send data into the body method post only the value is sent, not the key
  data: "Country=Brasil&City=Belo Horizonte",
  timeout: 1000,
  withCredentials: false,
  adapter: function (config) {
    // Do whatever you want
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
    // Do whatever you want with the faxios progress event
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
      // Custom visitor function to serialize form values
      visitor: (value, key, path, helpers) => {};

      // Use dots instead of brackets format
      dots: boolean;

      // Keep special endings like {} in parameter key
      metaTokens: boolean;

      // Usar formato de índices de arreglo:
        // null - sin corchetes
        // false - corchetes vacíos
        // true - corchetes con índices
      indexes: boolean;

      // Profundidad máxima de anidación de objetos. Lanza FaxiosError (ERR_FORM_DATA_DEPTH_EXCEEDED)
      // si se excede. Predeterminado: 100. Establecer en Infinity para desactivar.
      maxDepth: 100;
  }
}
```
