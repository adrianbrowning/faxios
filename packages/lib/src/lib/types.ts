// @ts-self-types="./types.d.ts"
// Internal shared types — imported by implementation files.
// Public API types in index.d.ts re-export or extend these.
// `x?: T | undefined` is not redundant for a consumer with `exactOptionalPropertyTypes`: without
// `| undefined` it can't pass the `undefined` that faxios treats as unset.
/* eslint-disable sonarjs/no-redundant-optional -- see above */

import type FaxiosHeaders from "./core/FaxiosHeaders.js";
import type { FaxiosHeadersInstance } from "./core/FaxiosHeaders.js";
import type { StandardSchemaV1 } from "./types/standard-schema.js";
import type { RequestInitShim, WebAbortSignal, WebBlob, WebBlobPart, WebBodyInit, WebEvent, WebHeaders, WebRequest, WebRequestInit, WebResponse, WebResponseInit, WebURL, WebURLSearchParams } from "./types/web.js";

export type StringLiteralsOrString<Literals extends string> =
  | Literals
  | (string & {});

export type FaxiosHeaderValue =
  | Array<string>
  | boolean
  | null
  | number
  | string;

type UppercaseMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "LINK"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PURGE"
  | "PUT"
  | "QUERY"
  | "UNLINK";

export type Method = Lowercase<UppercaseMethod> | UppercaseMethod;

type CommonRequestHeadersList =
  | "Accept"
  | "Accept-Encoding"
  | "Accept-Language"
  | "Authorization"
  | "Cache-Control"
  | "Content-Encoding"
  | "Content-Length"
  | "If-Match"
  | "If-Modified-Since"
  | "If-None-Match"
  | "Range"
  | "User-Agent"
  | "X-Requested-With";

type ContentType =
  | Exclude<FaxiosHeaderValue, string>
  | StringLiteralsOrString<
    | "application/graphql-response+json"
    | "application/json"
    | "application/json-patch+json"
    | "application/ld+json"
    | "application/merge-patch+json"
    | "application/octet-stream"
    | "application/problem+json"
    | "application/x-www-form-urlencoded"
    | "multipart/form-data"
    | "text/event-stream"
    | "text/html"
    | "text/plain"
  >;

/**
 * A header bag: header names mapped to header values. Any header name is
 * accepted in any casing; common names and `Content-Type` values are suggested.
 *
 * - Strings, numbers and string arrays are sent (numbers and `true` as strings).
 * - `undefined` drops a value inherited from defaults or an outer config;
 *   faxios may still set its own value (e.g. `Content-Type` for a JSON body).
 * - `null` or `false` keeps the header off the request entirely; faxios does
 *   not fill it in, and later merges keep it off unless they force an overwrite.
 */
export type RawFaxiosRequestHeaders =
  & { [header: string]: FaxiosHeaderValue | undefined; }
  & { [Header in CommonRequestHeadersList]?: FaxiosHeaderValue | undefined; }
  & { "Content-Type"?: ContentType | undefined; };

export type ResponseType =
  | "arraybuffer"
  | "blob"
  | "formdata"
  | "json"
  | "stream"
  | "text";

export interface TransitionalOptions {
  clarifyTimeoutError?: boolean | undefined;
  forcedJSONParsing?: boolean | undefined;
  validateStatusUndefinedResolves?: boolean | undefined;
}

/**
 * A signal faxios can watch: an `AbortSignal` from another realm or a polyfill. faxios listens for
 * its `abort` event, so the listener methods are required; a `signal` without them rejects with
 * `ERR_BAD_OPTION_VALUE`.
 */
export interface GenericAbortSignal {
  readonly aborted: boolean;
  addEventListener: (...args: Array<unknown>) => unknown;
  onabort?: ((event: WebEvent) => void) | null;
  removeEventListener: (...args: Array<unknown>) => unknown;
}

/**
 * A FormData-like target for `toFormData`: any object with an `append(name, value)` method, such
 * as the global `FormData` or the `form-data` package. A method, so its parameters are checked
 * bivariantly and the global `FormData` (whose `append` takes `string | Blob`) is accepted.
 */
export interface GenericFormData {
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- see above
  append(name: string, value: unknown, options?: unknown): unknown;
}

export interface GenericHTMLFormElement {
  method: string;
  name: string;
  submit: () => void;
}

export interface FormDataVisitorHelpers {
  convertValue: (value: unknown) => unknown;
  defaultVisitor: SerializerVisitor;
  isVisitable: (value: unknown) => boolean;
}

export interface SerializerVisitor {
  (
    this: GenericFormData,
    value: unknown,
    key: number | string,
    path: Array<number | string> | null,
    helpers: FormDataVisitorHelpers,
  ): boolean;
}

export interface SerializerOptions {
  /** FormData only: Blob constructor used to wrap `ArrayBuffer` and typed-array values. Defaults to `globalThis.Blob`. */
  Blob?: (new (parts: Array<WebBlobPart>) => WebBlob) | undefined;
  dots?: boolean | undefined;
  indexes?: boolean | null | undefined;
  /** Maximum nesting depth to serialize; deeper objects throw `ERR_FORM_DATA_DEPTH_EXCEEDED`. `Infinity` disables the check. */
  maxDepth?: number | undefined;
  metaTokens?: boolean | undefined;
  visitor?: SerializerVisitor | undefined;
}

// tslint:disable-next-line
export type FormSerializerOptions = SerializerOptions;

export interface ParamEncoder {
  (value: string, defaultEncoder: (value: string) => string): string;
}

export interface CustomParamsSerializer {
  (params: Record<string, unknown>, options?: ParamsSerializerOptions): string;
}

export interface ParamsSerializerOptions extends SerializerOptions {
  encode?: ParamEncoder | undefined;
  serialize?: CustomParamsSerializer | undefined;
}

type Milliseconds = number;

export interface FaxiosProgressEvent {
  bytes: number;
  download?: boolean;
  estimated?: number;
  lengthComputable: boolean;
  loaded: number;
  progress?: number;
  rate?: number;
  total?: number;
  upload?: boolean;
}

export interface FaxiosBasicCredentials {
  password: string;
  username: string;
}

export interface FaxiosRequestTransformer {
  (
    this: InternalFaxiosRequestConfig,
    data: unknown,
    headers: FaxiosHeaders,
  ): unknown;
}

export interface FaxiosResponseTransformer {
  (
    this: InternalFaxiosRequestConfig,
    data: unknown,
    headers: FaxiosHeaders,
    status?: number,
  ): unknown;
}

/**
 * `fetchOptions`: extra `fetch()` init options faxios passes through. The standard keys are
 * checked against the Fetch Standard; any other key (a runtime extension such as undici's
 * `dispatcher`, Next.js's `next` or Cloudflare's `cf`) is passed on unchecked. faxios sets
 * `body`, `credentials`, `duplex`, `headers`, `method` and `signal` itself and ignores them here.
 */
export type FaxiosFetchOptions = Omit<RequestInitShim, "body" | "credentials" | "duplex" | "headers" | "method" | "signal"> & { [option: string]: unknown; };

// Every optional field also takes `undefined`: mergeConfig treats an own `undefined` as unset, so
// `{ timeout: maybeNumber }` must compile under `exactOptionalPropertyTypes` too.
export interface FaxiosRequestConfig<D = unknown> {
  allowAbsoluteUrls?: boolean | undefined;
  auth?: FaxiosBasicCredentials | undefined;
  baseURL?: string | undefined;
  data?: D | undefined;
  env?: undefined | {
    fetch?: ((
      input: string | WebRequest | WebURL,
      init?: WebRequestInit
    ) => Promise<WebResponse>) | undefined;
    /** Constructed with no arguments to serialize `multipart/form-data` payloads; `null` falls back to the global `FormData`. */
    FormData?: (new () => object) | null | undefined;
    /** `null` disables the constructor, e.g. when a custom `fetch` is incompatible with the global one. */
    Request?: (new (
      input: string | WebRequest | WebURL,
      init?: WebRequestInit,
    ) => unknown) | null | undefined;
    Response?: (new (body?: WebBodyInit, init?: WebResponseInit) => WebResponse) | null | undefined;
  };
  fetchOptions?: FaxiosFetchOptions | undefined;
  formSerializer?: FormSerializerOptions | undefined;
  headers?: FaxiosConfigHeaders | undefined;
  maxBodyLength?: number | undefined;
  maxContentLength?: number | undefined;
  method?: StringLiteralsOrString<Method> | undefined;
  /**
   * Called with download progress. For a content-encoded response (any `Content-Encoding`
   * other than `identity`) `total` is `undefined` and `lengthComputable` is `false`.
   * An error thrown (or a rejected promise returned) by the callback is caught and ignored;
   * the request settles normally.
   */
  onDownloadProgress?: ((progressEvent: FaxiosProgressEvent) => void) | undefined;
  /**
   * Called with upload progress where faxios streams the request body: in server runtimes whose
   * `Request` reads the `duplex` option, which today is Node.js. Deno's and Bun's `Request` don't
   * read it, so faxios sends the body as it is and the callback is not called there. faxios never
   * streams the body in browsers or web workers (see #209).
   * An error thrown (or a rejected promise returned) by the callback is caught and ignored;
   * the request settles normally.
   */
  onUploadProgress?: ((progressEvent: FaxiosProgressEvent) => void) | undefined;
  params?: Record<string, unknown> | undefined | WebURLSearchParams;
  paramsSchema?: StandardSchemaV1 | undefined;
  paramsSerializer?: CustomParamsSerializer | ParamsSerializerOptions | undefined;
  parseReviver?: ((
    this: unknown,
    key: string,
    value: unknown,
    context?: { source?: string; }
  ) => unknown) | undefined;
  /**
   * Values for `{key}` placeholders in `url` (braces, not `:key`). Only own properties count.
   * Each value goes through `String()` then `encodeURIComponent`. A placeholder whose key is
   * missing, or whose value is `null` or `undefined`, rejects with `ERR_BAD_OPTION_VALUE`. Keys
   * with no matching placeholder are ignored. Without `pathParams`, placeholders are sent literally.
   */
  pathParams?: Record<string, unknown> | undefined;
  /**
   * Standard Schema that validates `pathParams` before substitution; its output replaces
   * `pathParams`. Requires `pathParams`, or the request rejects with `ERR_BAD_OPTION_VALUE`.
   * A validation failure, or output that isn't a plain object, rejects with `ERR_BAD_PATH_PARAMS_SCHEMA`.
   */
  pathParamsSchema?: StandardSchemaV1<unknown, Record<string, unknown>> | undefined;
  redact?: Array<string> | undefined;
  requestSchema?: StandardSchemaV1 | undefined;
  responseSchema?: StandardSchemaV1 | undefined;
  responseType?: ResponseType | undefined;
  signal?: GenericAbortSignal | undefined | WebAbortSignal;
  timeout?: Milliseconds | undefined;
  timeoutErrorMessage?: string | undefined;
  transformRequest?: Array<FaxiosRequestTransformer> | FaxiosRequestTransformer | undefined;
  transformResponse?:
    | Array<FaxiosResponseTransformer>
    | FaxiosResponseTransformer
    | undefined;
  transitional?: TransitionalOptions | undefined;
  /** The request URL; a `URL` instance is sent as its `href`. */
  url?: string | undefined | WebURL;
  validateStatus?: ((status: number) => boolean) | null | undefined;
  withCredentials?: boolean | undefined;
  withXSRFToken?:
    | ((config: InternalFaxiosRequestConfig) => boolean | undefined)
    | boolean
    | undefined;
  xsrfCookieName?: string | undefined;
  xsrfHeaderName?: string | undefined;
}

export type SchemaConfig<O, D = unknown> = FaxiosRequestConfig<D> & { responseSchema: StandardSchemaV1<unknown, O>; };

/**
 * Config for the request overloads typed by an explicit response generic `T`: a `responseSchema`
 * must output `T`, so the generic can't silently override what the schema returns.
 */
export type ResponseTypedConfig<T, D = unknown> = Omit<FaxiosRequestConfig<D>, "responseSchema"> & {
  responseSchema?: StandardSchemaV1<unknown, T> | undefined;
};

export interface InternalFaxiosRequestConfig<
  D = unknown
> extends FaxiosRequestConfig<D> {
  headers: FaxiosHeaders;
  // Normalized to a string before middleware runs.
  url?: string | undefined;
}

export interface FaxiosResponse<T = unknown, D = unknown> {
  config: InternalFaxiosRequestConfig<D>;
  data: T;
  headers: FaxiosHeaders;
  request?: null | WebRequest;
  status: number;
  statusText: string;
}

export type FaxiosPromise<T = unknown> = Promise<FaxiosResponse<T>>;

export interface HeadersDefaults {
  common: RawFaxiosRequestHeaders;
  delete: RawFaxiosRequestHeaders;
  get: RawFaxiosRequestHeaders;
  head: RawFaxiosRequestHeaders;
  link?: RawFaxiosRequestHeaders | undefined;
  options?: RawFaxiosRequestHeaders | undefined;
  patch: RawFaxiosRequestHeaders;
  post: RawFaxiosRequestHeaders;
  purge?: RawFaxiosRequestHeaders | undefined;
  put: RawFaxiosRequestHeaders;
  query?: RawFaxiosRequestHeaders | undefined;
  unlink?: RawFaxiosRequestHeaders | undefined;
}

export interface FaxiosDefaults<D = unknown> extends Omit<
  FaxiosRequestConfig<D>,
  "headers"
> {
  headers: HeadersDefaults;
}

/**
 * The `headers` option on every request config and on `create()`: a header
 * bag, method header groups (a header bag under `common` or a method name,
 * applied only to requests with that method), both mixed in one object, or a
 * `FaxiosHeaders` instance.
 */
export type FaxiosConfigHeaders =
  | FaxiosHeadersInstance
  | Iterable<readonly [string, string]>
  | Partial<HeadersDefaults>
  | RawFaxiosRequestHeaders
  | WebHeaders;

/** Config accepted by `create()`; identical to a request config. */
export type CreateFaxiosDefaults<D = unknown> = FaxiosRequestConfig<D>;

/**
 * Per-request state passed through `.use()` middleware. Created once per
 * request, after the request config is merged with the instance defaults.
 */
// `{}` defaults match a FaxiosInstance with no plugins, so a plain `FaxiosMiddleware` installs on one.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- see above
export interface FaxiosContext<TOptions = {}, TCapabilities = {}> {
  /**
   * The try this context leads to, counting from 1. `retry` sets it before each try, so middleware
   * installed after `retry` reads each try's number, and middleware installed before it reads the
   * last try's number once `next` settles. A hand-written retry middleware sets it the same way.
   */
  attempt: number;
  /** Values provided by installed plugins, shared by every request of the instance. */
  capabilities: TCapabilities;
  /**
   * The merged request config. `headers` is a `FaxiosHeaders` instance; middleware may assign a new
   * one, which dispatch normalizes the same way.
   */
  config: InternalFaxiosRequestConfig & TOptions;
  /**
   * The instance's own `baseURL` (`faxios.create({ baseURL })`), read when the request starts:
   * `undefined` when the instance has none. A per-request `baseURL` changes `ctx.config.baseURL`,
   * not this, so a plugin can tell the API the instance was made for from a request's override.
   */
  readonly instanceBaseURL: string | undefined;
  /** Null-prototype scratch space shared by middleware for this request only. */
  state: Record<PropertyKey, unknown>;
}

/**
 * Runs the rest of the middleware chain, then dispatches a copy of `ctx.config`. It takes the same
 * context type the middleware received, so a middleware can't pass on fewer capabilities or
 * options than later middleware expects.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the `{}` defaults of FaxiosContext
export type FaxiosNext<TOptions = {}, TCapabilities = {}> =
  (ctx: FaxiosContext<TOptions, TCapabilities>) => Promise<FaxiosResponse>;

/**
 * Onion-style lifecycle hook: code before `await next(ctx)` runs on the way in,
 * code after it on the way out. Returning without calling `next` skips dispatch.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the `{}` defaults of FaxiosContext
export type FaxiosMiddleware<TOptions = {}, TCapabilities = {}> = (
  ctx: FaxiosContext<TOptions, TCapabilities>,
  next: FaxiosNext<TOptions, TCapabilities>
) => Promise<FaxiosResponse>;

/**
 * The type slots of a `FaxiosPlugin`, all optional: `requires` holds the capabilities that must be
 * installed before it, `provides` the capabilities it adds to `ctx.capabilities`, and `options`
 * the request options it adds to every config-taking member.
 */
export interface FaxiosPluginSpec {
  options?: unknown;
  provides?: unknown;
  requires?: unknown;
}

// A slot the spec leaves out is `unknown`: nothing required, provided or added.
type PluginSlot<TSpec, K extends keyof FaxiosPluginSpec> = K extends keyof TSpec ? Required<TSpec>[K] : unknown;

// Any other key is `never`, so a misspelt slot (`require`) is an error instead of being ignored.
type OnlyPluginSlots<TSpec> = { [K in Exclude<keyof TSpec, keyof FaxiosPluginSpec>]: never; };

/**
 * The parts of a plugin that `use()` reads its type parameters from. Internal: build plugins with
 * `definePlugin()` or annotate them as `FaxiosPlugin`; `use()` infers `TRequires`, `TProvides`
 * and `TOptions` through this.
 */
export interface FaxiosPluginBase<TRequires = unknown, TProvides = unknown, TOptions = unknown> {
  middleware: FaxiosMiddleware<TOptions, TRequires & TProvides>;
  name: string;
  /** Internal, type-only marker that carries the type parameters for inference. Never set it. */
  readonly "~plugin"?: {
    readonly options: TOptions;
    readonly provides: TProvides;
    readonly requires: TRequires;
  };
}

/**
 * The runtime list of a plugin's request options: every option name mapped to `true`. Request
 * config keys that neither faxios nor an installed plugin declares reject with `ERR_BAD_OPTION`.
 */
export type FaxiosPluginOptionNames<TOptions> = { readonly [K in keyof TOptions]-?: true; };

/**
 * Middleware bundled with the capabilities it requires and provides, typed by one
 * `FaxiosPluginSpec`: `FaxiosPlugin<{ requires?; provides?; options? }>`. Declaring `provides`
 * makes the `provides` value required, so a plugin can't claim a capability it never supplies.
 * Declaring `options` makes the `options` names required, so every request option is accepted.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}`: a plugin with no slots
export type FaxiosPlugin<TSpec extends FaxiosPluginSpec & OnlyPluginSlots<TSpec> = {}> =
  FaxiosPluginBase<PluginSlot<TSpec, "requires">, PluginSlot<TSpec, "provides">, PluginSlot<TSpec, "options">>
  & ([keyof PluginSlot<TSpec, "provides">] extends [never]
    ? { provides?: PluginSlot<TSpec, "provides">; }
    : { provides: PluginSlot<TSpec, "provides">; })
  & ([keyof PluginSlot<TSpec, "options">] extends [never]
    ? { options?: FaxiosPluginOptionNames<PluginSlot<TSpec, "options">>; }
    : { options: FaxiosPluginOptionNames<PluginSlot<TSpec, "options">>; });

/** What `use()` and `eject()` accept as a plugin: the base plus optional `provides` and `options`. Internal. */
export type FaxiosPluginArgument<TRequires = unknown, TProvides = unknown, TOptions = unknown> =
  FaxiosPluginBase<TRequires, TProvides, TOptions> & { options?: Readonly<Record<string, true>>; provides?: TProvides; };
