# API reference

Below is a list of all the available functions and classes in the faxios package. These functions may be used and imported in your project. All of these functions and classes are protected by our renewed promise to follow semantic versioning. This means that you can rely on these functions and classes to remain stable and unchanged in future releases unless a major version change is made.

## Entry points

| Import path | Exports |
| --- | --- |
| `@gcmdev/faxios` | the default `faxios` instance, the classes and functions on this page, and the types, including the plugin types `FaxiosPlugin`, `FaxiosMiddleware`, `FaxiosContext` and `FaxiosNext` |
| `@gcmdev/faxios/plugins` | `definePlugin` only |
| `@gcmdev/faxios/plugins/auth-bearer` | `authBearer` and the types `AuthBearerOptions` and `AuthBearerCapability` |
| `@gcmdev/faxios/plugins/retry` | `retry` and the types `RetryOptions` and `RetryRequestOptions` |
| `@gcmdev/faxios/plugins/timing` | `timing` and the type `TimingEvent` |

The built-in plugins are only available from their own subpaths. Neither the package root nor `@gcmdev/faxios/plugins` re-exports them.

## Instance

The `faxios` instance is the main object that you will use to make HTTP requests. It is a factory function that creates a new instance of the `faxios` class. The `faxios` instance has a number of methods that you can use to make HTTP requests. These methods are documented in the [Request aliases section](/pages/advanced/request-method-aliases) of the documentation. The default export and every `faxios.create()` instance also have [`use()` and `eject()`](#middleware-and-plugins).

## Classes

### `Faxios`

The `Faxios` class is the class behind every faxios instance. The default export and `faxios.create()` both build a callable instance on top of it. The `Faxios` class has a number of methods that you can use to make HTTP requests. These methods are documented in the [Request aliases section](/pages/advanced/request-method-aliases) of the documentation. An instance built with `new Faxios()` has no `use()` or `eject()`; use `faxios.create()` to get an instance that takes middleware.

#### `constructor`

Creates a new instance of the `Faxios` class. The constructor takes an optional configuration object as an argument.

```ts check=skip
constructor(instanceConfig?: FaxiosRequestConfig);
```

#### `request`

Handles request invocation and response resolution. This is the main method that you will use to make HTTP requests. It takes a configuration object as an argument and returns a promise that resolves to the response object.

```ts check=skip
request<T = unknown, R = FaxiosResponse<T>, D = unknown>(configOrUrl: string | FaxiosRequestConfig<D>, config?: FaxiosRequestConfig<D>): Promise<R>;
```

## Functions

### `FaxiosError`

The `FaxiosError` class is an error class that is thrown when an HTTP request fails. It extends the `Error` class and adds additional properties to the error object. Its type parameters `FaxiosError<T = unknown, D = unknown>` type the response data and the request data.

#### `constructor`

Creates a new instance of the `FaxiosError` class. The constructor takes a message and an optional code, config, request, and response as arguments.

```ts check=skip
constructor(message: string, code?: string, config?: InternalFaxiosRequestConfig<D>, request?: unknown, response?: FaxiosResponse<T, D>);
```

#### `properties`

The `FaxiosError` class provides the following properties:

```ts check=skip
// Config instance.
config?: InternalFaxiosRequestConfig<D>;

// Error code.
code?: string;

// Request instance.
request?: unknown;

// Response instance.
response?: FaxiosResponse<T, D>;

// Boolean indicating if the error is a `FaxiosError`.
isFaxiosError: boolean;

// Error status code.
status?: number;

// Helper method to convert the error to a JSON object.
toJSON: () => object;

// Error cause.
cause?: Error;

// Schema issues, set on the ERR_BAD_*_SCHEMA errors. Each issue carries `message` and `path`.
issues?: ReadonlyArray<StandardSchemaV1.Issue>;
```

### `FaxiosHeaders`

The `FaxiosHeaders` class is a utility class that is used to manage HTTP headers. It provides methods for manipulating headers, such as adding, removing, and getting headers.

Only the main methods are documented here. For a full list of methods, please refer to the type declaration file.

#### `constructor`

Creates a new instance of the `FaxiosHeaders` class. The constructor takes an optional headers object as an argument.

```ts check=skip
constructor(headers?: Record<string, unknown> | FaxiosHeaders | string | null);
```

#### `set`

Adds a header to the headers object.
Empty or whitespace-only header names are ignored.

```ts check=skip
set(headerName: string, value: FaxiosHeaderValue, rewrite?: boolean): FaxiosHeaders;
set(headers: Record<string, unknown> | FaxiosHeaders | string, rewrite?: boolean): FaxiosHeaders;
```

#### `get`

Gets a header from the headers object.

```ts check=skip
get(headerName: string): FaxiosHeaderValue | undefined;
get(headerName: string, parser: true): Record<string, string> | undefined;
get(headerName: string, parser: RegExp): RegExpExecArray | null | undefined;
get<R>(headerName: string, parser: (value: FaxiosHeaderValue, header: string) => R): R | undefined;
```

#### `has`

Checks if a header exists in the headers object.

```ts check=skip
has(header: string, matcher?: string | RegExp | ((value: string, name: string) => boolean)): boolean;
```

#### `delete`

Removes a header from the headers object.

```ts check=skip
delete(header: string | string[], matcher?: string | RegExp | ((value: string, name: string) => boolean)): boolean;
```

#### `clear`

Removes all headers from the headers object.

```ts check=skip
clear(matcher?: string | RegExp | ((value: string, name: string) => boolean)): boolean;
```

#### `normalize`

Normalizes the headers object.

```ts check=skip
normalize(format?: boolean): FaxiosHeaders;
```

#### `concat`

Concatenates headers objects.

```ts check=skip
concat(...targets: Array<FaxiosHeaders | Record<string, unknown> | string | undefined | null>): FaxiosHeaders;
```

#### `toJSON`

Converts the headers object to a JSON object.

```ts check=skip
// With asStrings: true, array values are joined with ", ".
toJSON(asStrings?: boolean): Record<string, unknown>;
```

### `CanceledError` <Badge type="tip" text="Extended FaxiosError" />

The `CanceledError` class is an error class that is thrown when an HTTP request is canceled. It extends the `FaxiosError` class.

### `Cancel` <Badge type="tip" text="Alias for CanceledError" />

The `Cancel` class is an alias for the `CanceledError` class. It is exported for backwards compatibility and will be removed in a future release.

### `isCancel`

A function that checks if an error is a `CanceledError`. Useful for distinguishing intentional cancellations from unexpected errors.

```ts check=skip
isCancel(value: unknown): value is CanceledError;
```

```js
import faxios from "@gcmdev/faxios";

const controller = new AbortController();

faxios.get("/api/data", { signal: controller.signal }).catch((error) => {
  if (faxios.isCancel(error)) {
    console.log("Request was cancelled:", error.message);
  } else {
    console.error("Unexpected error:", error);
  }
});

controller.abort("User navigated away");
```

### `isFaxiosError`

A function that checks if an error is a `FaxiosError`. Use this in `catch` blocks to safely access faxios-specific error properties like `error.response` and `error.config`. It is a type guard, so in TypeScript (or checked JavaScript) it narrows the error to `FaxiosError`. Pass a type argument to type `error.response.data`; the shape is not checked at runtime.

```ts check=skip
isFaxiosError<T = unknown, D = unknown>(value: unknown): value is FaxiosError<T, D>;
```

```js status=500
import faxios from "@gcmdev/faxios";

try {
  await faxios.get("/api/resource");
} catch (error) {
  if (faxios.isFaxiosError(error)) {
    // error.response, error.config, error.code are all typed here
    console.error("HTTP error", error.response?.status, error.message);
  } else {
    // A non-faxios error (e.g. a programming mistake)
    throw error;
  }
}
```

### `all` <Badge type="danger" text="Deprecated in favour of Promise.all" />

The `all` function is a utility function that takes an array of promises and returns a single promise that resolves when all of the promises in the array have resolved. The `all` function is now deprecated in favour of the `Promise.all` method. It is recommended that you use the `Promise.all` method instead.

As of version 0.22.0, the `all` function is deprecated and will be removed in a future release. It is recommended that you use the `Promise.all` method instead.

### `spread`

The `spread` function is a utility function that can be used to spread an array of arguments into a function call. This is useful when you have an array of arguments that you want to pass to a function that takes multiple arguments. It is available on the instance as `faxios.spread` and is not a named export.

```ts check=skip
spread(callback: (...args: unknown[]) => unknown): (array: unknown[]) => unknown;
```

### `toFormData`

Converts a plain JavaScript object (or a nested one) to a `FormData` instance. Useful when you want to programmatically build multipart form data from an object.

```ts check=skip
toFormData(sourceObj: unknown, formData?: FormData | null, options?: FormSerializerOptions): FormData;
```

```js
import faxios, { toFormData } from "@gcmdev/faxios";

const fileBlob = new Blob(["avatar bytes"], { type: "image/png" });
const data = { name: "Jay", avatar: fileBlob };
const form = toFormData(data);
// form is now a FormData instance ready to post
await faxios.post("/api/users", form);
```

### `formToJSON`

Converts a `FormData` instance back to a plain JavaScript object. Useful for reading form data in a structured format.

```ts check=skip
formToJSON(form: FormData | HTMLFormElement): unknown;
```

```js
import { formToJSON } from "@gcmdev/faxios";

const form = new FormData();
form.append("name", "Jay");
form.append("role", "admin");

const obj = formToJSON(form);
console.log(obj); // { name: "Jay", role: "admin" }
```

### `mergeConfig`

Merges two faxios config objects together, applying the same deep-merge strategy that faxios uses internally when combining defaults with per-request options. Later values take precedence.

```ts check=skip
mergeConfig(config1: FaxiosRequestConfig, config2?: FaxiosRequestConfig): FaxiosRequestConfig;
```

```js
import { mergeConfig } from "@gcmdev/faxios";

const base = { baseURL: "https://api.example.com", timeout: 5000 };
const override = { timeout: 10000, headers: { "X-Custom": "value" } };

const merged = mergeConfig(base, override);
// { baseURL: "https://api.example.com", timeout: 10000, headers: { "X-Custom": "value" } }
```

## Middleware and plugins

See [Middleware and plugins](/pages/advanced/middleware) for a guide with examples.

### `use`

Registers middleware or a plugin on the instance and returns the instance. Middleware runs in registration order before the request is sent and in reverse order after it.

```ts check=skip
use(middlewareOrPlugin: FaxiosMiddleware<TOpts, TCaps> | FaxiosPlugin<Spec>): FaxiosInstance<TOpts & Options, TCaps & Provides>;
```

The return value is the same object at runtime, typed with the plugin's request options and capabilities added. Keep it and make requests through it: the instance you called `use()` on has the plugin installed too, but its type doesn't know the plugin's options.

Installing a plugin before one that provides a capability it requires is a type error, and so is installing a second plugin that provides the same capability. At runtime the duplicate throws a `FaxiosError` with code `ERR_BAD_OPTION`. A value that is neither a function nor a plugin with a `middleware` function, or a plugin without a non-empty `name`, throws `ERR_BAD_OPTION_VALUE`.

`use()` exists on the default export and on `faxios.create()` instances. Children made with `create()` start with no middleware and without the parent's plugin types.

### `eject`

Removes middleware or a plugin by reference, so pass the same value you gave `use()`. Requests already running keep the middleware they started with. The capabilities the plugin provided are removed; the instance type isn't narrowed.

```ts check=skip
eject(middlewareOrPlugin: FaxiosMiddleware | FaxiosPlugin): void;
```

### `definePlugin`

Imported from `@gcmdev/faxios/plugins`. Builds a plugin and infers its `FaxiosPlugin` type: `provides` from the `provides` value, and the request options and required capabilities from the middleware's `ctx: FaxiosContext<Options, Capabilities>` annotation. Capabilities the plugin provides itself don't count as required. Returns the object it was given.

```ts check=skip
definePlugin(plugin: {
  name: string;
  provides?: Provides;
  middleware: FaxiosMiddleware<Options, Capabilities>;
}): FaxiosPlugin<{ requires: Required; provides: Provides; options: Options }>;
```

### `FaxiosContext`

The `ctx` every middleware receives. It is created once per request, after the request config is merged with the instance defaults.

```ts check=skip
interface FaxiosContext<TOptions = {}, TCapabilities = {}> {
  // The merged request config, with the plugin request options. `headers` is a FaxiosHeaders.
  config: InternalFaxiosRequestConfig & TOptions;
  // Null-prototype scratch space for this request only.
  state: Record<PropertyKey, unknown>;
  // Values installed plugins provide, shared by every request of the instance.
  capabilities: TCapabilities;
}
```

### `FaxiosMiddleware` and `FaxiosNext`

`next(ctx)` runs the rest of the chain, then dispatches a copy of `ctx.config`. It takes the same context type the middleware received.

```ts check=skip
type FaxiosNext<TOptions = {}, TCapabilities = {}> =
  (ctx: FaxiosContext<TOptions, TCapabilities>) => Promise<FaxiosResponse>;

type FaxiosMiddleware<TOptions = {}, TCapabilities = {}> =
  (ctx: FaxiosContext<TOptions, TCapabilities>, next: FaxiosNext<TOptions, TCapabilities>) => Promise<FaxiosResponse>;
```

### `FaxiosPlugin`

A plugin's type, given as one object of optional slots. Use it to annotate a plugin factory's return type.

```ts check=skip
type FaxiosPlugin<Spec extends { requires?: unknown; provides?: unknown; options?: unknown } = {}>;
// A plugin object has:
//   name: string;
//   middleware: FaxiosMiddleware<Options, Requires & Provides>;
//   provides: Provides; (required when the spec declares provides, optional otherwise)
```

- `requires`: capabilities that must be installed before the plugin.
- `provides`: capabilities the plugin adds to `ctx.capabilities`.
- `options`: request options the plugin adds to every config-taking member, including `defaults`, `define()` and `route()`. They must be optional.

A slot you leave out adds nothing. Any other key, such as `require`, is a type error. The `"~plugin"` property in the emitted types is an internal marker; never set or read it.

### `FaxiosInstance`

`FaxiosInstance<TOpts = {}, TCaps = {}>` is the type of the default export and of `faxios.create()` instances. `TOpts` holds the request options and `TCaps` the capabilities that installed plugins added through `use()`.

## Constants

### `HttpStatusCode`

An object that contains a list of HTTP status codes as named constants. Use this to write readable conditionals instead of bare numbers.

```js status=404
import faxios, { HttpStatusCode } from "@gcmdev/faxios";

try {
  await faxios.get("/api/resource");
} catch (error) {
  if (faxios.isFaxiosError(error)) {
    if (error.response?.status === HttpStatusCode.NotFound) {
      console.error("Resource not found");
    } else if (error.response?.status === HttpStatusCode.Unauthorized) {
      console.error("Authentication required");
    }
  }
}
```

## Miscellaneous

### `VERSION`

The current version of the `faxios` package. This is a string that represents the version number of the package. It is updated with each release of the package.
