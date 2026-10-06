# TypeScript example

## Importing types

faxios ships with TypeScript definitions out of the box. You can import the types you need directly from `"@gcmdev/faxios"`:

```ts
import faxios, { FaxiosError } from "@gcmdev/faxios";
import type { FaxiosRequestConfig, FaxiosResponse } from "@gcmdev/faxios";
```

## Typing a request

Use a generic type parameter on the response to tell TypeScript what shape your data will have:

```ts
import faxios from "@gcmdev/faxios";

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
import faxios from "@gcmdev/faxios";

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
import faxios from "@gcmdev/faxios";

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
import faxios from "@gcmdev/faxios";
import type { FaxiosInstance } from "@gcmdev/faxios";

const api: FaxiosInstance = faxios.create({
  baseURL: "https://api.example.com",
  timeout: 5000,
});
```

## Typed middleware

Annotate middleware written outside `use()` with `FaxiosMiddleware`. `ctx.config.headers` is a `FaxiosHeaders`, and a failed request reaches the middleware as a rejection from `next`:

```ts
import faxios from "@gcmdev/faxios";
import type { FaxiosMiddleware } from "@gcmdev/faxios";

const addClientHeader: FaxiosMiddleware = async (ctx, next) => {
  ctx.config.headers.set("X-Client", "my-app");
  return next(ctx);
};

const logErrors: FaxiosMiddleware = async (ctx, next) => {
  try {
    return await next(ctx);
  } catch (error) {
    console.error(`${ctx.config.method} ${ctx.config.url} failed`, error);
    throw error;
  }
};

const api = faxios.create({ baseURL: "https://api.example.com" })
  .use(addClientHeader)
  .use(logErrors);

await api.get("/users");
```

For bearer tokens, install the [`authBearer`](/pages/advanced/authentication) plugin instead of setting `Authorization` yourself. See [Middleware and plugins](/pages/advanced/middleware) for ordering, plugins and typed request options.

## Typing errors

Use `faxios.isFaxiosError()` to narrow the type of a caught error. Pass the shape your API returns as a type argument to type `error.response.data`. faxios does not check that shape at runtime, so validate it if the server might send something else:

```ts status=401
import faxios from "@gcmdev/faxios";

type ApiError = {
  message: string;
  code: number;
};

try {
  await faxios.get("/api/protected-resource");
} catch (error) {
  if (faxios.isFaxiosError<ApiError>(error)) {
    // error.response?.data is typed as ApiError
    console.error(error.response?.data.message);
    console.error(error.response?.status);
  } else {
    throw error;
  }
}
```

## TypeScript configuration notes

faxios is published as ESM only, so there are a few caveats depending on your setup:

- The recommended setting is `"moduleResolution": "node16"` (implied by `"module": "node16"`). This requires TypeScript 4.7 or greater.
- There is no CJS build and no `index.d.cts`; load faxios with `import`.
