# Request aliases

faxios provides a set of aliases for making HTTP requests. These aliases are shortcuts for making requests using the `request` method. The aliases are designed to be easy to use and to provide a more convenient way to make requests.

faxios endeavours to follow RFC 7231 and RFC 5789, as closely as possible. The aliases are designed to be consistent with the HTTP methods defined in these RFCs.

### `faxios`

faxios can be used to make HTTP request by passing only the config object. The full config object is documented [here](/pages/advanced/request-config)

```ts check=skip
faxios(url: string | FaxiosRequestConfig<D>, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
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

When using the alias methods, the `url`, `method`, and `data` properties don't need to be specified in config.

### `request`

The `request` method is the main method that you will use to make HTTP requests. It takes a configuration object as an argument and returns a promise that resolves to the response object. The `request` method is a generic method that can be used to make any type of HTTP request.

```ts check=skip
faxios.request(config: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
```

### `get`

The `get` method is used to make a GET request. It takes a URL and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts check=skip
faxios.get(url: string, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
```

### `delete`

The `delete` method is used to make a DELETE request. It takes a URL and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts check=skip
faxios.delete(url: string, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
```

### `head`

The `head` method is used to make a HEAD request. It takes a URL and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts check=skip
faxios.head(url: string, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
```

### `options`

The `options` method is used to make an OPTIONS request. It takes a URL and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts check=skip
faxios.options(url: string, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
```

### `post`

The `post` method is used to make a POST request. It takes a URL, an optional data object, and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts check=skip
faxios.post(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
```

### `put`

The `put` method is used to make a PUT request. It takes a URL, an optional data object, and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts check=skip
faxios.put(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
```

### `patch`

The `patch` method is used to make a PATCH request. It takes a URL, an optional data object, and an optional configuration object as arguments and returns a promise that resolves to the response object.

```ts check=skip
faxios.patch(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
```

### `query`

The `query` method is used to make a QUERY request, a safe and idempotent method that carries a body. It takes a URL, an optional data object, and an optional configuration object as arguments and returns a promise that resolves to the response object. Use it for read-style operations whose parameters are too complex or sensitive to fit in the URL.

```ts check=skip
faxios.query(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
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

The `getUri` method returns the URL that would be sent for a given config without actually making the request. It applies `baseURL`, `paramsSerializer`, and `params`. It does not substitute `pathParams` or run schemas, so `{key}` placeholders come back as written rather than as faxios would put them on the wire. Useful for building links, debugging serialization, or reusing the resolved URL in another request.

```ts check=skip
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
Use `getUri` on an instance (`instance.getUri(config)`) to inherit the instance's `baseURL`, `params`, and `paramsSerializer` defaults.
:::

## Form data shorthand methods

These methods are equivalent to their counterparts above, but preset `Content-Type` to `multipart/form-data`. They are the recommended way to upload files or submit HTML forms.

### `postForm`

```ts check=skip
faxios.postForm(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
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

```ts check=skip
faxios.putForm(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
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

```ts check=skip
faxios.patchForm(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<FaxiosResponse<T>>;
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
