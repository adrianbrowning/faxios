# API reference

This page lists every export of the package root, `@gcmdev/faxios`: the classes, functions and constants each have a section, and the types are in the [Types](#types) table. The plugin subpaths are listed under [Entry points](#entry-points) and documented on their own pages. Everything listed here follows the [versioning policy](/pages/misc/semver).

The declaration blocks on this page are checked against the package's shipped TypeScript declarations whenever the docs are tested, so they show the signatures you get. A few name a helper type, such as `HeaderInput`, that the block defines because the package doesn't export it by name.

## Entry points

| Import path | Exports |
| --- | --- |
| `@gcmdev/faxios` | the default `faxios` instance, and the classes, functions, constants and types on this page |
| `@gcmdev/faxios/plugins` | `definePlugin` only |
| `@gcmdev/faxios/plugins/auth-bearer` | `authBearer` and the types `AuthBearerOptions` and `AuthBearerCapability` |
| `@gcmdev/faxios/plugins/authenticate` | `authenticate` and the types `AuthenticateOptions`, `AuthenticateCredentials` and `AuthenticateCredentialValues` |
| `@gcmdev/faxios/plugins/forward-to` | `forwardTo` and the types `ForwardToOptions` and `ForwardToRequestOptions` |
| `@gcmdev/faxios/plugins/retry` | `retry` and the types `RetryOptions` and `RetryRequestOptions` |
| `@gcmdev/faxios/plugins/timing` | `timing` and the type `TimingEvent` |

The built-in plugins are only available from their own subpaths. Neither the package root nor `@gcmdev/faxios/plugins` re-exports them.

## Instance

### `faxios` <Badge type="tip" text="Default export" />

The default export is a ready-made instance. Call it, or one of its [request aliases](/pages/advanced/request-method-aliases), to send a request. The default export and every `create()` instance also have [`use()` and `eject()`](#middleware-and-plugins), `defaults`, `getUri()`, [`define()`](/pages/advanced/define) and `route()`. Only the default export also carries the statics listed under [`FaxiosStatic`](#types), such as `faxios.isCancel` and `faxios.spread`.

### `create`

Creates a new instance with its own defaults, middleware and plugins. It is the same function as `faxios.create`. See [Creating an instance](/pages/advanced/create-an-instance).

```ts contract=@gcmdev/faxios
create(instanceConfig?: CreateFaxiosDefaults): FaxiosInstance;
```

## Classes

### `Faxios`

The `Faxios` class is the class behind every faxios instance. The default export and `create()` both build a callable instance on top of it. Its methods are documented in the [Request aliases section](/pages/advanced/request-method-aliases). An instance built with `new Faxios()` has no `use()` or `eject()`; use `create()` to get an instance that takes middleware.

#### `constructor`

Creates a new instance of the `Faxios` class. The constructor takes an optional configuration object as an argument.

```ts contract=@gcmdev/faxios#Faxios
constructor(instanceConfig?: FaxiosRequestConfig);
```

#### `request`

Sends a request and returns a promise that resolves to the response. With a `responseSchema` in the config, `response.data` is typed by the schema's output; otherwise by the response generic `T`, which a `responseSchema` must then output.

```ts contract=@gcmdev/faxios#Faxios
type SchemaConfig<O, D> = FaxiosRequestConfig<D> & { responseSchema: StandardSchemaV1<unknown, O> };
type ResponseTypedConfig<T, D> = Omit<FaxiosRequestConfig<D>, "responseSchema"> & { responseSchema?: StandardSchemaV1<unknown, T> | undefined };
request<O, D = unknown>(config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
request<O, D = unknown>(url: string | URL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
request<T = unknown, D = unknown>(configOrUrl: ResponseTypedConfig<T, D> | string | URL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
```

### `FaxiosError`

The `FaxiosError` class is the error a failed request rejects with. It extends `Error`. Its type parameters `FaxiosError<T = unknown, D = unknown>` type the response data and the request data. The error codes faxios sets are statics on the class (`FaxiosError.ERR_NETWORK`, `FaxiosError.ETIMEDOUT`, ...); their union is the `FaxiosErrorCode` type. See [Error handling](/pages/advanced/error-handling).

#### `constructor`

Creates a new instance of the `FaxiosError` class. The constructor takes a message and an optional code, config, request, and response as arguments.

```ts contract=@gcmdev/faxios#FaxiosError<T,D>
constructor(message: string, code?: string, config?: InternalFaxiosRequestConfig<D>, request?: unknown, response?: FaxiosResponse<T, D>);
```

#### `properties`

The `FaxiosError` class provides the following properties:

```ts contract=@gcmdev/faxios#FaxiosError<T,D>
// The request config.
config?: InternalFaxiosRequestConfig<D>;

// One of the `FaxiosErrorCode` statics (`ERR_NETWORK`, `ETIMEDOUT`, ...),
// or a code a plugin or a wrapped error set.
code?: FaxiosErrorCode | (string & {});

// The request.
request?: unknown;

// The response, when the server answered.
response?: FaxiosResponse<T, D>;

// Always true; isFaxiosError() checks it.
isFaxiosError: boolean;

// The response status code.
status?: number;

// The error this one wraps.
cause?: Error;

// Schema issues, set on the ERR_BAD_*_SCHEMA errors. Each issue carries `message` and `path`.
issues?: ReadonlyArray<StandardSchemaV1.Issue>;
```

#### `toJSON`

Returns a plain object for logging. It masks the `authorization`, `proxy-authorization`, `cookie` and `auth` config keys and the keys in the [`redact`](/pages/advanced/request-config#redact) option, and strips `user:pass@` from `url` and `baseURL`.

```ts contract=@gcmdev/faxios#FaxiosError<T,D>
type SerializedCause = { cause?: SerializedCause; code?: string; message: string; name: string };
toJSON(): { message: string; name: string; stack: string | undefined; config: unknown; code: string | (string & {}) | undefined; status: number | undefined; issues: readonly StandardSchemaV1.Issue[] | undefined; cause: SerializedCause | undefined };
```

### `FaxiosHeaders`

The `FaxiosHeaders` class manages HTTP headers: header names are case-insensitive, and its methods add, read, match and remove headers. Every method is described on [Header methods](/pages/advanced/header-methods).

Each instance also has `get`, `set` and `has` shortcuts for `Content-Type`, `Content-Length`, `Accept`, `Accept-Encoding`, `User-Agent` and `Authorization` (for example `headers.getContentType()`). The set is fixed: there is no `FaxiosHeaders.accessor()` to add more.

```ts contract=@gcmdev/faxios#FaxiosHeaders
// What the constructor, set(), concat() and the statics read: another FaxiosHeaders, a header
// object, raw `Name: value` lines, or an iterable of [name, value] pairs (a Headers, a Map, an array).
type HeaderInput = FaxiosHeaders | Record<string, FaxiosHeaderValue | undefined> | Iterable<readonly [string, FaxiosHeaderValue | undefined]> | Headers | string | null | undefined;
type HeaderMatcher = string | RegExp | ((this: FaxiosHeaders, value: string, name: string) => boolean);
type HeaderParser<R> = (this: FaxiosHeaders, value: FaxiosHeaderValue, header: string) => R;
constructor(headers?: HeaderInput);

// Empty or whitespace-only header names are ignored.
set(header: string, value?: FaxiosHeaderValue, rewrite?: boolean): this;
set(headers: HeaderInput, rewrite?: boolean): this;

get(header: string): FaxiosHeaderValue | undefined;
get(header: string, parser: true): Record<string, string> | undefined;
get(header: string, parser: RegExp): null | RegExpExecArray | undefined;
get<R>(header: string, parser: HeaderParser<R>): R | undefined;

has(header: string, matcher?: HeaderMatcher): boolean;
delete(header: Array<string> | string, matcher?: HeaderMatcher): boolean;
clear(matcher?: HeaderMatcher): boolean;
normalize(format?: boolean): this;
concat(...targets: Array<HeaderInput>): FaxiosHeaders;

// With asStrings: true, array values are joined with ", ".
toJSON(asStrings?: boolean): Record<string, unknown>;
toString(): string;
getSetCookie(): Array<string>;

static from(thing?: HeaderInput): FaxiosHeaders;
static concat(first: HeaderInput, ...targets: Array<HeaderInput>): FaxiosHeaders;
```

### `CanceledError` <Badge type="tip" text="Extended FaxiosError" />

The `CanceledError` class is the error a canceled request rejects with, code `ERR_CANCELED`. It extends the `FaxiosError` class.

```ts contract=@gcmdev/faxios#CanceledError
constructor(message?: null | string, config?: InternalFaxiosRequestConfig, request?: unknown);
```

## Functions

### `isCancel`

A function that checks if an error is a `CanceledError`. Useful for distinguishing intentional cancellations from unexpected errors.

```ts contract=@gcmdev/faxios
isCancel(value: unknown): value is CanceledError;
```

```js expect=log:Request%20was%20cancelled:%20User%20navigated%20away
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

```ts contract=@gcmdev/faxios
isFaxiosError<T = unknown, D = unknown>(payload: unknown): payload is FaxiosError<T, D>;
```

```js status=500 expect=error:HTTP%20error%20500
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

### `isSchemaValidationError`

A type guard for the errors a schema rejects with: `ERR_BAD_RESPONSE_SCHEMA`, `ERR_BAD_REQUEST_SCHEMA`, `ERR_BAD_PARAMS_SCHEMA` and `ERR_BAD_PATH_PARAMS_SCHEMA`. It narrows to `SchemaValidationError`, whose `issues` is always set; for `ERR_BAD_RESPONSE_SCHEMA`, `response` is set too. See [Schema validation](/pages/advanced/schema-validation).

```ts contract=@gcmdev/faxios
isSchemaValidationError(err: unknown): err is SchemaValidationError;
```

### `toFormData`

Converts a plain JavaScript object (or a nested one) to a `FormData` instance. Useful when you want to programmatically build multipart form data from an object. Without a target it creates a global `FormData`; a target can also be any FormData-like object with an `append(name, value)` method (`GenericFormData`), such as one from the `form-data` package, and is returned with its own type.

```ts contract=@gcmdev/faxios
toFormData(obj: unknown, formData?: null, options?: FormSerializerOptions): FormData;
toFormData<F extends GenericFormData>(obj: unknown, formData: F, options?: FormSerializerOptions): F;
toFormData(obj: unknown, formData?: GenericFormData | null, options?: FormSerializerOptions): GenericFormData;
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

Converts a `FormData` instance (or an HTML form element) back to a plain JavaScript object, and returns `null` for anything else. Field names split into nested keys only on `.` and brackets (`user[email]`, `user.email`), so names such as `first-name` stay one key.

```ts contract=@gcmdev/faxios
formToJSON(thing: unknown): null | Record<string, unknown>;
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

```ts contract=@gcmdev/faxios
mergeConfig(config1: FaxiosDefaults | FaxiosRequestConfig, config2?: FaxiosRequestConfig): FaxiosRequestConfig;
```

```js
import { mergeConfig } from "@gcmdev/faxios";

const base = { baseURL: "https://api.example.com", timeout: 5000 };
const override = { timeout: 10000, headers: { "X-Custom": "value" } };

const merged = mergeConfig(base, override);
// { baseURL: "https://api.example.com", timeout: 10000, headers: { "X-Custom": "value" } }
```

### `resolveRequestURL`

Returns the URL a request with this config is sent to: `url` (a `URL` as its `href`) with its `{key}` placeholders filled from `pathParams`, joined to `baseURL` (honouring `allowAbsoluteUrls`), then `params` serialized with `paramsSerializer`. It is the resolver faxios itself uses for requests and `getUri()`, exported for plugins. It uses `allowAbsoluteUrls` as given: unset, an absolute `url` replaces `baseURL`; requests and `getUri()` set it from the instance defaults first. It throws the `FaxiosError` the request would reject with, `ERR_INVALID_URL` for a config with neither `url` nor `baseURL` and `ERR_BAD_OPTION_VALUE` for a `url` that isn't a string or `URL` included. See [Writing a plugin](/pages/plugins/writing-a-plugin).

```ts contract=@gcmdev/faxios
resolveRequestURL(config: FaxiosRequestConfig): string;
```

### `canceledFromSignal`

Returns the error faxios rejects a request with when its signal aborts. A `FaxiosError` reason (such as the `ETIMEDOUT` of `timeout`) is returned as is; otherwise a `CanceledError` whose message comes from an `Error` or string reason (else "canceled"), keeping an `Error` reason as `cause`. Exported for plugins.

```ts contract=@gcmdev/faxios
canceledFromSignal(signal: { readonly aborted: boolean; reason?: unknown; }, config?: InternalFaxiosRequestConfig, request?: unknown): FaxiosError;
```

### `assertSignal`

Throws the `ERR_BAD_OPTION_VALUE` `FaxiosError` faxios rejects with for a `signal` it can't watch: one without `aborted`, `addEventListener` and `removeEventListener`. `undefined` and `null` pass. Exported for plugins.

```ts contract=@gcmdev/faxios
assertSignal(signal: unknown, config: InternalFaxiosRequestConfig): void;
```

### `AbortableSignal`

The part of an `AbortSignal` that `onAbort` and `raceAbort` use, so a polyfilled signal or one from another realm works too. `GenericAbortSignal`, what the `signal` option accepts, extends it with an optional `onabort`.

```ts contract=@gcmdev/faxios
type AbortableSignal = {
  readonly aborted: boolean;
  addEventListener: (type: "abort", listener: () => void) => unknown;
  removeEventListener: (type: "abort", listener: () => void) => unknown;
};
```

### `onAbort`

Calls `listener` once when `signal` aborts, or at once when it already has. Returns what removes the listener. Exported for plugins.

```ts contract=@gcmdev/faxios
onAbort(signal: AbortableSignal, listener: () => void): () => void;
```

### `raceAbort`

Settles with what `run` gives, or rejects with `abortError()` as soon as `signal` aborts. An already-aborted signal rejects without calling `run`, and a result that loses the race is still consumed. Exported for plugins.

```ts contract=@gcmdev/faxios
raceAbort<T>(signal: AbortableSignal, run: () => PromiseLike<T> | T, abortError: () => unknown): Promise<T>;
```

### `hasOwnInPrototypeChain`

Whether `prop` is an own property of `thing` or of an object on its prototype chain below `Object.prototype`, so a value only a polluted `Object.prototype` supplies doesn't count. A chain a `Proxy` makes cyclic ends the walk. Exported for plugins.

```ts contract=@gcmdev/faxios
hasOwnInPrototypeChain(thing: unknown, prop: PropertyKey): boolean;
```

### `stripUserInfo`

Returns `url` without the `user:pass@` of its authority, so it is safe to log. Only user info at the start of `url` is removed: after the scheme (`https://user:pass@host` becomes `https://host`) or after `//` in a protocol-relative URL. Backslashes count as slashes, as in the WHATWG URL parser. `FaxiosError#toJSON()` uses it on `url` and `baseURL`, and `timing` on the URL it reports. Exported for plugins.

```ts contract=@gcmdev/faxios
stripUserInfo(url: string): string;
```

### `stripUserInfoInText`

Returns `text` without the `user:pass@` after each `scheme://` in it, so free text such as an error message is safe to log. The scan takes time linear in the length of `text`. `FaxiosError#toJSON()` uses it on the messages of the cause chain, and `timing` on the error message it reports. Exported for plugins.

```ts contract=@gcmdev/faxios
stripUserInfoInText(text: string): string;
```

### `all` <Badge type="danger" text="Deprecated in favour of Promise.all" />

The `all` function takes an array of promises and returns a single promise that resolves when all of them have resolved. It is typed like `Promise.all`: a tuple of promises (or plain values) resolves to a tuple of their results. Use `Promise.all` instead.

```ts contract=@gcmdev/faxios
all<T extends [] | ReadonlyArray<unknown>>(values: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }>;
```

The `all` function is deprecated and will be removed in a future release.

### `spread`

The `spread` function wraps a function so it takes its arguments as one array, for `all(...).then(spread(...))`. It is available on the default export as `faxios.spread` and is not a named export.

```ts contract=@gcmdev/faxios#FaxiosStatic
spread<TArgs extends Array<unknown>, TResult>(fn: (...args: TArgs) => TResult): (arr: TArgs) => TResult;
```

## Middleware and plugins

See [Middleware](/pages/advanced/middleware) and [Plugins](/pages/plugins/) for guides with examples.

### `use`

Registers middleware or a plugin on the instance and returns the instance. Middleware runs in registration order before the request is sent and in reverse order after it. This summary leaves out the type-level checks the shipped declaration adds; see `FaxiosInstance` in the type declaration file.

```ts check=skip reason=signature
use(middlewareOrPlugin: FaxiosMiddleware<TOpts, TCaps> | FaxiosPlugin<Spec>): FaxiosInstance<TOpts & Options, TCaps & Provides>;
```

The return value is the same object at runtime, typed with the plugin's request options and capabilities added. Keep it and make requests through it: the instance you called `use()` on has the plugin installed too, but its type doesn't know the plugin's options.

Installing a plugin before one that provides a capability it requires is a type error, and so is installing a second plugin that provides the same capability. At runtime the duplicate throws a `FaxiosError` with code `ERR_BAD_OPTION`. A value that is neither a function nor a plugin with a `middleware` function, a plugin without a non-empty `name`, or a plugin whose own `options` isn't an object, throws `ERR_BAD_OPTION_VALUE`.

While a plugin is installed, the request option names in its `options` are accepted in request config. Any other key that isn't a faxios option rejects the request with `ERR_BAD_OPTION`; `eject()` removes the names again.

`use()` exists on the default export and on `create()` instances. Children made with `create()` start with no middleware and without the parent's plugin types.

### `eject`

Removes middleware or a plugin by reference, so pass the same value you gave `use()`. Requests already running keep the middleware they started with. The capabilities the plugin provided are removed; the instance type isn't narrowed.

```ts check=skip reason=signature
eject(middlewareOrPlugin: FaxiosMiddleware | FaxiosPlugin): void;
```

### `definePlugin`

Imported from `@gcmdev/faxios/plugins`. Builds a plugin and infers its `FaxiosPlugin` type: `provides` from the `provides` value, and the request options and required capabilities from the middleware's `ctx: FaxiosContext<Options, Capabilities>` annotation. Capabilities the plugin provides itself don't count as required. Returns the object it was given. This is a summary; the shipped declaration also checks the `options` names against the context's request options.

```ts check=skip reason=signature
definePlugin(plugin: {
  name: string;
  provides?: Provides;
  // Required, naming every option, when the middleware's context declares request options.
  options?: { [name in keyof Options]: true };
  middleware: FaxiosMiddleware<Options, Capabilities>;
}): FaxiosPlugin<{ requires: Required; provides: Provides; options: Options }>;
```

### `FaxiosContext`

The `ctx` every middleware receives. It is created once per request, after the request config is merged with the instance defaults.

```ts contract=@gcmdev/faxios
interface FaxiosContext<TOptions = {}, TCapabilities = {}> {
  // The try this context leads to, from 1. `retry` (or your own retry middleware) sets it per try.
  attempt: number;
  // Values installed plugins provide, shared by every request of the instance.
  capabilities: TCapabilities;
  // The merged request config, with the plugin request options. `headers` is a FaxiosHeaders.
  config: InternalFaxiosRequestConfig & TOptions;
  // The instance's own baseURL, read when the request starts; a per-request baseURL doesn't change it.
  readonly instanceBaseURL: string | undefined;
  // Null-prototype scratch space for this request only.
  state: Record<PropertyKey, unknown>;
}
```

### `FaxiosMiddleware` and `FaxiosNext`

`next(ctx)` runs the rest of the chain, then dispatches a copy of `ctx.config`. It takes the same context type the middleware received.

```ts contract=@gcmdev/faxios
type FaxiosNext<TOptions = {}, TCapabilities = {}> =
  (ctx: FaxiosContext<TOptions, TCapabilities>) => Promise<FaxiosResponse>;

type FaxiosMiddleware<TOptions = {}, TCapabilities = {}> =
  (ctx: FaxiosContext<TOptions, TCapabilities>, next: FaxiosNext<TOptions, TCapabilities>) => Promise<FaxiosResponse>;
```

### `FaxiosPlugin`

A plugin's type, given as one object of optional slots (`FaxiosPluginSpec`). Use it to annotate a plugin factory's return type. The shape below is a summary of the shipped type.

```ts check=skip reason=signature
type FaxiosPlugin<Spec extends { requires?: unknown; provides?: unknown; options?: unknown } = {}>;
// A plugin object has:
//   name: string;
//   middleware: FaxiosMiddleware<Options, Requires & Provides>;
//   provides: Provides; (required when the spec declares provides, optional otherwise)
//   options: { [name in keyof Options]: true }; (required when the spec declares options, optional otherwise)
```

- `requires`: capabilities that must be installed before the plugin.
- `provides`: capabilities the plugin adds to `ctx.capabilities`.
- `options`: request options the plugin adds to every config-taking member, including `defaults`, `define()` and `route()`. They must be optional. The plugin object names each of them in its `options` value (a `FaxiosPluginOptionNames<Options>`), which is how faxios accepts them at runtime.

A slot you leave out adds nothing. Any other key, such as `require`, is a type error. The `"~plugin"` property in the emitted types is an internal marker; never set or read it.

### `FaxiosInstance`

`FaxiosInstance<TOpts = {}, TCaps = {}>` is the type of the default export and of `create()` instances. `TOpts` holds the request options and `TCaps` the capabilities that installed plugins added through `use()`.

## Constants

### `HttpStatusCode`

An object that contains a list of HTTP status codes as named constants. Use this to write readable conditionals instead of bare numbers. Each name has its literal type (`HttpStatusCode.NotFound` is `404`), and like a TypeScript enum each code maps back to its name (`HttpStatusCode[404]` is `"NotFound"`).

```js status=404 expect=error:Resource%20not%20found
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

### `VERSION`

The version of the installed package, as a string such as `"0.2.4"`.

## Types

The package root exports these types. Import them with `import type { ... } from "@gcmdev/faxios"`.

| Type | What it describes |
| --- | --- |
| `FaxiosRequestConfig` | A request config; every key is described on [Request config](/pages/advanced/request-config) |
| `InternalFaxiosRequestConfig` | The merged config middleware, transformers and errors see: a request config whose `headers` is a `FaxiosHeaders` |
| `FaxiosDefaults` | The instance `defaults`: a request config with header groups per method |
| `CreateFaxiosDefaults` | The config `create()` takes |
| `HeadersDefaults` | The header groups of `defaults.headers`: `common` and one per method |
| `FaxiosConfigHeaders` | What the `headers` option takes: a header object, method header groups, a `Headers` or a `FaxiosHeaders` |
| `RawFaxiosRequestHeaders` | A plain header object for a request |
| `FaxiosHeaderValue` | One header value: a string, number, boolean, array of strings, `null` or `undefined` |
| `FaxiosResponse` | The resolved response: `data`, `status`, `statusText`, `headers`, `config` and `request` |
| `FaxiosPromise` | `Promise<FaxiosResponse<T>>` |
| `FaxiosErrorCode` | The union of the `FaxiosError` code statics |
| `SchemaValidationError` | The `FaxiosError` that [`isSchemaValidationError`](#isschemavalidationerror) narrows to |
| `Method` | An HTTP method name, in lower or upper case |
| `ResponseType` | The values of the [`responseType`](/pages/advanced/request-config#responsetype) option |
| `FaxiosBasicCredentials` | The [`auth`](/pages/advanced/request-config#auth) option: `username` and `password` |
| `FaxiosFetchOptions` | The [`fetchOptions`](/pages/advanced/request-config#fetchoptions) option |
| `FaxiosProgressEvent` | What `onDownloadProgress` and `onUploadProgress` receive |
| `FaxiosRequestTransformer` | A [`transformRequest`](/pages/advanced/request-config#transformrequest) function |
| `FaxiosResponseTransformer` | A [`transformResponse`](/pages/advanced/request-config#transformresponse) function |
| `ParamsSerializerOptions` | The object form of the [`paramsSerializer`](/pages/advanced/request-config#paramsserializer) option |
| `CustomParamsSerializer` | The function form of the `paramsSerializer` option |
| `FormSerializerOptions` | The [`formSerializer`](/pages/advanced/request-config#formserializer) option, also taken by `toFormData()` |
| `SerializerVisitor` | The `visitor` function `FormSerializerOptions` takes, called for each value `toFormData()` serializes |
| `FormDataVisitorHelpers` | The helpers a `SerializerVisitor` gets: `defaultVisitor`, `convertValue` and `isVisitable` |
| `TransitionalOptions` | The [`transitional`](/pages/advanced/request-config#transitional) option |
| `GenericAbortSignal` | An `AbortSignal`-like object the `signal` option accepts: an [`AbortableSignal`](#abortablesignal) with an optional `onabort` |
| `GenericFormData` | A FormData-like object with an `append(name, value)` method |
| `GenericHTMLFormElement` | An HTML-form-like object `toFormData()` and `formToJSON()` read |
| `StandardSchemaV1` | The [Standard Schema](https://standardschema.dev/) v1 interface the schema options take |
| `FaxiosInstance` | A faxios instance, see [`FaxiosInstance`](#faxiosinstance) |
| `FaxiosStatic` | The default export: a `FaxiosInstance` plus the statics `all`, `spread`, `isCancel`, `isFaxiosError`, `mergeConfig`, `toFormData`, `formToJSON`, `HttpStatusCode`, `VERSION`, the classes and `default` |
| `FaxiosContext` | The middleware context, see [`FaxiosContext`](#faxioscontext) |
| `FaxiosMiddleware` | A middleware function, see [`FaxiosMiddleware` and `FaxiosNext`](#faxiosmiddleware-and-faxiosnext) |
| `FaxiosNext` | The `next` function a middleware calls |
| `FaxiosPlugin` | A plugin, see [`FaxiosPlugin`](#faxiosplugin) |
| `FaxiosPluginSpec` | The optional `requires`, `provides` and `options` slots of a `FaxiosPlugin` |
| `FaxiosPluginOptionNames` | A plugin's runtime list of request option names, each mapped to `true` |
| `DefineConfig` | The config [`define()`](/pages/advanced/define) takes |
| `DefinedEndpoint` | The endpoint function `define()` returns |
| `FaxiosLike` | Internal: the `request` shape `define()` and `route()` take. Not part of the documented API |
| `BasePerCallConfig` | The request config every endpoint call takes: everything except `url`, `method`, `pathParams`, `params`, `data` and the schemas |
| `PerCallConfig` | The config one endpoint call takes: `BasePerCallConfig` plus `pathParams`, `params` and `data`, typed by their schemas |
| `RouteConfig` | The config `route()` takes |
| `RouteBuilder` | The object `route()` returns, with one endpoint factory per method |
| `RouteMethodConfig` | The config one of those factories takes |
