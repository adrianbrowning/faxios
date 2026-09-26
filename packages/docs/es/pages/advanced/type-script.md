# TypeScript

`faxios` incluye definiciones de TypeScript en el paquete npm a través de `index.d.ts`, por lo que la verificación de tipos y el soporte del editor funcionan de manera nativa.

## Consideraciones sobre la resolución de módulos

Dado que faxios se publica solo como ESM, hay algunas consideraciones de configuración:

- La configuración recomendada es `"moduleResolution": "node16"` (implícita en `"module": "node16"`). Esto requiere TypeScript 4.7 o superior.
- Si usas ESM, tu configuración debería estar bien.
- No hay compilación CJS ni `index.d.cts`. `require('faxios')` solo funciona mediante la interoperabilidad ESM de Node.

## Type guards para errores de faxios

Usa el type guard `faxios.isAxiosError` para reducir de forma segura los errores `unknown` en bloques `catch`. Tras la reducción, puedes acceder a propiedades específicas de faxios como `error.response`, `error.config` y `error.code` con seguridad de tipos completa.

```ts
import faxios from "faxios";

let user: User | null = null;
try {
  const { data } = await faxios.get("/user?ID=12345");
  user = data.userDetails;
} catch (error) {
  if (faxios.isAxiosError(error)) {
    handleAxiosError(error);
  } else {
    handleUnexpectedError(error);
  }
}
```

Usa `faxios.isCancel<T>()` para reducir los errores de cancelación a `CanceledError<T>`:

```ts
const controller = new AbortController();

try {
  await faxios.get<User>("/user?ID=12345", { signal: controller.signal });
} catch (error) {
  if (faxios.isCancel<User>(error)) {
    handleCancellation(error);
  }
}
```

## Instancias e interceptores tipados

Anota el resultado de `faxios.create` con `AxiosInstance`, y anota los interceptores de solicitud con `InternalAxiosRequestConfig` para obtener verificación de tipos de extremo a extremo en un cliente personalizado:

```ts
import faxios, { AxiosInstance, InternalAxiosRequestConfig } from "faxios";

const apiClient: AxiosInstance = faxios.create({
  baseURL: "https://api.example.com",
  timeout: 10000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Añadir token de autenticación, registrar, etc.
  return config;
});
```

## Tipado de los datos de respuesta

Los métodos de solicitud de faxios son genéricos sobre el tipo de los datos de respuesta. Pasa un parámetro de tipo a `faxios.get<T>` (y a los demás alias) para tipar `response.data`:

```ts
interface User {
  id: number;
  name: string;
}

const { data } = await apiClient.get<User>("/users/1");
// `data` está tipado como `User`
```
