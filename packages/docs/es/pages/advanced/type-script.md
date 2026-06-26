# TypeScript

`faxios` incluye definiciones de TypeScript en el paquete npm a través de `index.d.ts` (ESM) e `index.d.cts` (CJS), por lo que la verificación de tipos y el soporte del editor funcionan de manera nativa para ambos formatos de módulo.

## Consideraciones sobre la resolución de módulos

Dado que faxios publica de forma dual con una exportación por defecto ESM y un `module.exports` CJS, hay algunas consideraciones de configuración:

- La configuración recomendada es `"moduleResolution": "node16"` (implícita en `"module": "node16"`). Esto requiere TypeScript 4.7 o superior.
- Si usas ESM, tu configuración debería estar bien.
- Si compilas TypeScript a CJS y no puedes usar `"moduleResolution": "node16"`, debes habilitar `esModuleInterop`.
- Si usas TypeScript para verificar tipos en código JavaScript CJS, tu única opción es `"moduleResolution": "node16"`.

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
