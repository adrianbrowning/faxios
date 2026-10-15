# Request aliases

faxios provides a set of aliases for making HTTP requests. These aliases are shortcuts for making requests using the `request` method. The aliases are designed to be easy to use and to provide a more convenient way to make requests.

faxios endeavours to follow RFC 7231 and RFC 5789, as closely as possible. The aliases are designed to be consistent with the HTTP methods defined in these RFCs.

### `faxios`

faxios can be used to make HTTP request by passing only the config object. The full config object is documented [here](/pages/advanced/request-config)

Every request method has two overloads. With a `responseSchema` in the config, `response.data` is typed by the schema's output. Without one, it is typed by the response generic `T` (`unknown` by default); a `responseSchema` passed with an explicit `T` must output `T`. `D` types the request data. `SchemaConfig` and `ResponseTypedConfig` are names for this page only; the package exports neither.

```ts contract=@gcmdev/faxios#FaxiosInstance
// With a responseSchema, response.data is typed by the schema's output O.
type SchemaConfig<O, D> = FaxiosRequestConfig<D> & { responseSchema: StandardSchemaV1<unknown, O> };
// Otherwise it is typed by T, which a responseSchema (if any) must output.
type ResponseTypedConfig<T, D> = Omit<FaxiosRequestConfig<D>, "responseSchema"> & { responseSchema?: StandardSchemaV1<unknown, T> | undefined };
faxios<O, D = unknown>(config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios<O, D = unknown>(url: string | URL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios<T = unknown, D = unknown>(config: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
faxios<T = unknown, D = unknown>(url: string | URL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

```js
import faxios from "@gcmdev/faxios";

// Send a POST request
await faxios({
  method: "post",
  url: "/user/12345",
  data: {
    firstName: "Fred",
    lastName: "Flintstone",
  },
});

// Send a GET request (default method)
await faxios("/user/12345");
```

## Method aliases

The following aliases are available for making requests:

When using the alias methods, the `url`, `method`, and `data` properties don't need to be specified in config. Every `url` argument can be a string or a `URL` instance.

### `request`

The `request` method is the main method that you will use to make HTTP requests. It takes a configuration object as an argument and returns a promise that resolves to the response object. The `request` method is a generic method that can be used to make any type of HTTP request.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.request<O, D = unknown>(config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.request<T = unknown, D = unknown>(config: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `get`

The `get` method is used to make a GET request. It takes a URL and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.get<O, D = unknown>(url: string | URL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.get<T = unknown, D = unknown>(url: string | URL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `delete`

The `delete` method is used to make a DELETE request. It takes a URL and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.delete<O, D = unknown>(url: string | URL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.delete<T = unknown, D = unknown>(url: string | URL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `head`

The `head` method is used to make a HEAD request. It takes a URL and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.head<O, D = unknown>(url: string | URL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.head<T = unknown, D = unknown>(url: string | URL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `options`

The `options` method is used to make an OPTIONS request. It takes a URL and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.options<O, D = unknown>(url: string | URL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.options<T = unknown, D = unknown>(url: string | URL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `post`

The `post` method is used to make a POST request. It takes a URL, an optional data object, and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.post<O, D = unknown>(url: string | URL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.post<T = unknown, D = unknown>(url: string | URL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `put`

The `put` method is used to make a PUT request. It takes a URL, an optional data object, and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.put<O, D = unknown>(url: string | URL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.put<T = unknown, D = unknown>(url: string | URL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `patch`

The `patch` method is used to make a PATCH request. It takes a URL, an optional data object, and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.patch<O, D = unknown>(url: string | URL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.patch<T = unknown, D = unknown>(url: string | URL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `query`

The `query` method is used to make a QUERY request, a safe and idempotent method that carries a body. It takes a URL, an optional data object, and an optional configuration object as arguments and returns a promise that resolves to the response object. Use it for read-style operations whose parameters are too complex or sensitive to fit in the URL.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.query<O, D = unknown>(url: string | URL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.query<T = unknown, D = unknown>(url: string | URL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

```js
import faxios from "@gcmdev/faxios";

// Send a complex search filter as a request body
const { data } = await faxios.query("/api/search", {
  selector: ["name", "email"],
  filter: { active: true, role: "admin" },
});
```

::: warning Draft specification
The QUERY method is defined by an IETF [Internet-Draft](https://datatracker.ietf.org/doc/draft-ietf-httpbis-safe-method-w-body/) and has not yet been standardized. Semantics and the method name itself may change before final publication, and server, proxy, and CDN support is uneven. Verify your stack accepts `QUERY` end to end before relying on it in production.
:::

### `getUri`

The `getUri` method returns the URL that would be sent for a given config without actually making the request. It fills `{key}` placeholders from `pathParams` and applies `baseURL`, `allowAbsoluteUrls`, `paramsSerializer`, and `params` the same way a request does, so it returns the URL faxios puts on the wire. It does not run schemas: `pathParams` is used as given, and a missing placeholder throws `ERR_BAD_OPTION_VALUE`. A config with neither `url` nor `baseURL` (here or on the instance) throws `ERR_INVALID_URL`. Useful for building links, debugging serialization, or reusing the resolved URL in another request.

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.getUri(config?: FaxiosRequestConfig): string;
```

```js
import faxios from "@gcmdev/faxios";

const url = faxios.getUri({
  url: "/users",
  baseURL: "https://api.example.com",
  params: { active: true, role: "admin" },
});
// "https://api.example.com/users?active=true&role=admin"
```

::: tip
Use `getUri` on an instance (`instance.getUri(config)`) to inherit the instance's `baseURL`, `allowAbsoluteUrls`, `pathParams`, `params`, and `paramsSerializer` defaults.
:::

## Form data shorthand methods

These methods are equivalent to their counterparts above, but preset `Content-Type` to `multipart/form-data`. They are the recommended way to upload files or submit HTML forms.

### `postForm`

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.postForm<O, D = unknown>(url: string | URL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.postForm<T = unknown, D = unknown>(url: string | URL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

```ts check=types
import faxios from "@gcmdev/faxios";

// Upload a file from a browser file input
const fileInput = document.querySelector<HTMLInputElement>("#fileInput");
await faxios.postForm("/api/upload", {
  file: fileInput?.files?.[0],
  description: "Profile photo",
});
```

### `putForm`

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.putForm<O, D = unknown>(url: string | URL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.putForm<T = unknown, D = unknown>(url: string | URL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

```ts check=types
import faxios from "@gcmdev/faxios";

// Replace a resource with form data
const avatarInput = document.querySelector<HTMLInputElement>("#avatarInput");
await faxios.putForm("/api/users/1/avatar", {
  avatar: avatarInput?.files?.[0],
});
```

### `patchForm`

```ts contract=@gcmdev/faxios#FaxiosInstance
faxios.patchForm<O, D = unknown>(url: string | URL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
faxios.patchForm<T = unknown, D = unknown>(url: string | URL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

```ts check=types
import faxios from "@gcmdev/faxios";

// Update specific fields using form data
const avatarInput = document.querySelector<HTMLInputElement>("#avatarInput");
await faxios.patchForm("/api/users/1", {
  displayName: "New Name",
  avatar: avatarInput?.files?.[0],
});
```

::: tip
`postForm`, `putForm`, and `patchForm` accept all the same data types as their base methods — plain objects, `FormData`, `FileList`, and `HTMLFormElement`. See [File posting](/pages/advanced/file-posting) for more examples.
:::
