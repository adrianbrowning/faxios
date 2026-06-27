# TypeScript example

## Importing types

faxios ships with TypeScript definitions out of the box. You can import the types you need directly from `"faxios"`:

```ts
import faxios from "faxios";
import type { AxiosRequestConfig, AxiosResponse, FaxiosError } from "faxios";
```

## Typing a request

Use a generic type parameter on the response to tell TypeScript what shape your data will have:

```ts
import faxios from "faxios";

type Post = {
  userId: number;
  id: number;
  title: string;
  body: string;
};

const response = await faxios.get<Post>("https://jsonplaceholder.typicode.com/posts/1");

console.log(response.data.title); // TypeScript knows this is a string
```

## Typing a function

Wrap requests in functions with explicit return types for maximum type safety:

```ts
import faxios, { AxiosResponse } from "faxios";

type Post = {
  userId: number;
  id: number;
  title: string;
  body: string;
};

const getPost = async (id: number): Promise<Post> => {
  const response = await faxios.get<Post>(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return response.data;
};
```

## Typing a POST request

You can type both the request body and the expected response:

```ts
type CreatePostBody = {
  title: string;
  body: string;
  userId: number;
};

type CreatePostResponse = CreatePostBody & { id: number };

const createPost = async (data: CreatePostBody): Promise<CreatePostResponse> => {
  const response = await faxios.post<CreatePostResponse>(
    "https://jsonplaceholder.typicode.com/posts",
    data
  );
  return response.data;
};
```

## Typed faxios instance

Create a typed instance so your base URL and headers are baked in:

```ts
import faxios from "faxios";
import type { AxiosInstance } from "faxios";

const api: AxiosInstance = faxios.create({
  baseURL: "https://api.example.com",
  timeout: 5000,
});
```

## Typed interceptors

Use `InternalAxiosRequestConfig` (not `AxiosRequestConfig`) for request interceptors in v1.x:

```ts
import faxios from "faxios";
import type { InternalAxiosRequestConfig, AxiosResponse } from "faxios";

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers.set("Authorization", `Bearer ${getToken()}`);
  return config;
});

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => Promise.reject(error)
);
```

## Typing errors

Use `faxios.isAxiosError()` to narrow the type of a caught error:

```ts
import faxios, { FaxiosError } from "faxios";

type ApiError = {
  message: string;
  code: number;
};

try {
  await faxios.get("/api/protected-resource");
} catch (error) {
  if (faxios.isAxiosError<ApiError>(error)) {
    // error.response?.data is typed as ApiError
    console.error(error.response?.data.message);
    console.error(error.response?.status);
  } else {
    throw error;
  }
}
```

## TypeScript configuration notes

Because faxios dual-publishes ESM and CJS, there are a few caveats depending on your setup:

- The recommended setting is `"moduleResolution": "node16"` (implied by `"module": "node16"`). This requires TypeScript 4.7 or greater.
- If you compile TypeScript to CJS and cannot use `"moduleResolution": "node16"`, enable `"esModuleInterop": true`.
- If you use TypeScript to type-check CJS JavaScript code, your only option is `"moduleResolution": "node16"`.
