# TypeScript

`faxios` ships TypeScript definitions in the npm package via `index.d.ts`, so type checking and editor support work out of the box.

## Module resolution caveats

faxios is published as ESM only, so there are a few configuration caveats:

- The recommended setting is `"moduleResolution": "node16"` (implied by `"module": "node16"`) or `"bundler"`. `node16` requires TypeScript 4.7 or greater.
- If you use ESM, your settings should be fine.
- There is no CJS build and no `index.d.cts`. `require('faxios')` works only through Node's ESM interop.

## Type guards for faxios errors

Use the `faxios.isAxiosError` type guard to safely narrow `unknown` errors in `catch` blocks. After narrowing, you can access faxios-specific properties like `error.response`, `error.config`, and `error.code` with full type safety.

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

Use `faxios.isCancel<T>()` to narrow cancellation errors to `CanceledError<T>`:

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

## Typed instances and interceptors

Annotate the result of `faxios.create` with `AxiosInstance`, and annotate request interceptors with `InternalAxiosRequestConfig` to get end-to-end type checking on a custom client:

```ts
import faxios, { AxiosInstance, InternalAxiosRequestConfig } from "faxios";

const apiClient: AxiosInstance = faxios.create({
  baseURL: "https://api.example.com",
  timeout: 10000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Add auth token, log, etc.
  return config;
});
```

## Typing response data

faxios request methods are generic over the response data type. Pass a type parameter to `faxios.get<T>` (and the other aliases) to type `response.data`:

```ts
interface User {
  id: number;
  name: string;
}

const { data } = await apiClient.get<User>("/users/1");
// `data` is typed as `User`
```

## Inferring response data from a schema

When using `responseSchema`, TypeScript infers `response.data` from the schema's output type automatically — no manual generic needed:

```ts
import { z } from "zod";

const UserSchema = z.object({ name: z.string(), age: z.number() });
const { data } = await faxios.get("/user/1", { responseSchema: UserSchema });
// data is typed as { name: string; age: number }
```

See [Schema validation](/pages/advanced/schema-validation), and [`define()`](/pages/advanced/define) / [`route()`](/pages/advanced/route) for typed endpoint functions.
