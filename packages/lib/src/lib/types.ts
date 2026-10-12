// @ts-self-types="./types.d.ts"
// Internal shared types — imported by implementation files.
// Public API types in index.d.ts re-export or extend these.

import type { FaxiosHeadersInstance } from "./core/FaxiosHeaders.js";
import type { StandardSchemaV1 } from "./types/standard-schema.js";

export type StringLiteralsOrString<Literals extends string> =
  | Literals
  | (string & {});

export type FaxiosHeaderValue =
  | Array<string>
  | boolean
  | null
  | number
  | string;

export interface RawFaxiosHeaders {
  [key: string]: FaxiosHeaderValue;
}

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
  & { [Header in CommonRequestHeadersList]?: FaxiosHeaderValue; }
  & { "Content-Type"?: ContentType; };

export type ResponseType =
  | "arraybuffer"
  | "blob"
  | "document"
  | "formdata"
  | "json"
  | "response"
  | "stream"
  | "text";

type UppercaseResponseEncoding =
  | "ANSI"
  | "ASCII"
  | "BASE64"
  | "BASE64URL"
  | "BINARY"
  | "HEX"
  | "LATIN1"
  | "UCS2"
  | "UCS-2"
  | "UTF8"
  | "UTF16LE"
  | "UTF-8";

export type responseEncoding =
  | Lowercase<UppercaseResponseEncoding>
  | UppercaseResponseEncoding;

export interface TransitionalOptions {
  advertiseZstdAcceptEncoding?: boolean;
  clarifyTimeoutError?: boolean;
  forcedJSONParsing?: boolean;
  silentJSONParsing?: boolean;
  validateStatusUndefinedResolves?: boolean;
}

export interface GenericAbortSignal {
  readonly aborted: boolean;
  addEventListener?: (...args: Array<unknown>) => unknown;
  onabort?: ((event: Event) => void) | null;
  removeEventListener?: (...args: Array<unknown>) => unknown;
}

export interface GenericFormData {
  append: (name: string, value: unknown, options?: unknown) => unknown;
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
  dots?: boolean;
  indexes?: boolean | null;
  /** Maximum nesting depth to serialize; deeper objects throw `ERR_FORM_DATA_DEPTH_EXCEEDED`. `Infinity` disables the check. */
  maxDepth?: number;
  metaTokens?: boolean;
  visitor?: SerializerVisitor;
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
  encode?: ParamEncoder;
  serialize?: CustomParamsSerializer;
}

type BrowserProgressEvent = unknown;
type Milliseconds = number;

export interface FaxiosProgressEvent {
  bytes: number;
  download?: boolean;
  estimated?: number;
  event?: BrowserProgressEvent;
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

// forward-declared; implemented in core/FaxiosHeaders.ts
// Using a structural type that matches FaxiosHeaders class methods
type HeaderMatcher =
  | ((value: string, name: string) => boolean)
  | RegExp
  | string;

type HeaderGetResult = Array<string> | null | Record<string, string> | RegExpExecArray | string | true | undefined;

export type FaxiosRequestHeaders = Record<string, FaxiosHeaderValue> & {
  clear: (matcher?: HeaderMatcher) => boolean;
  concat: (...targets: Array<unknown>) => FaxiosRequestHeaders;
  delete: (header: Array<string> | string, matcher?: HeaderMatcher) => boolean;
  get: (header: string, parser?: boolean | RegExp) => HeaderGetResult;
  getAccept: (matcher?: HeaderMatcher) => HeaderGetResult;
  getAcceptEncoding: (matcher?: HeaderMatcher) => HeaderGetResult;
  getAuthorization: (matcher?: HeaderMatcher) => HeaderGetResult;
  getContentLength: (matcher?: HeaderMatcher) => HeaderGetResult;
  getContentType: (matcher?: HeaderMatcher) => HeaderGetResult;
  getUserAgent: (matcher?: HeaderMatcher) => HeaderGetResult;
  has: (header: string, matcher?: HeaderMatcher) => boolean;
  hasAccept: (matcher?: HeaderMatcher) => boolean;
  hasAcceptEncoding: (matcher?: HeaderMatcher) => boolean;
  hasAuthorization: (matcher?: HeaderMatcher) => boolean;
  hasContentLength: (matcher?: HeaderMatcher) => boolean;
  hasContentType: (matcher?: HeaderMatcher) => boolean;
  hasUserAgent: (matcher?: HeaderMatcher) => boolean;
  normalize: (format?: boolean) => FaxiosRequestHeaders;
  set: (header: Record<string, unknown> | string, value?: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  setAccept: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  setAcceptEncoding: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  setAuthorization: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;

  setContentLength: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  setContentType: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  setUserAgent: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  toJSON: (asStrings?: boolean) => Record<string, FaxiosHeaderValue>;
};

export interface FaxiosRequestTransformer {
  (
    this: InternalFaxiosRequestConfig,
    data: unknown,
    headers: FaxiosRequestHeaders,
  ): unknown;
}

export interface FaxiosResponseTransformer {
  (
    this: InternalFaxiosRequestConfig,
    data: unknown,
    headers: RawFaxiosHeaders,
    status?: number,
  ): unknown;
}

export interface FaxiosRequestConfig<D = unknown> {
  allowAbsoluteUrls?: boolean;
  auth?: FaxiosBasicCredentials;
  baseURL?: string;
  data?: D;
  env?: {
    fetch?: (
      input: Request | string | URL,
      init?: RequestInit
    ) => Promise<Response>;
    /** Constructed with no arguments to serialize `multipart/form-data` payloads; `null` falls back to the global `FormData`. */
    FormData?: (new () => object) | null;
    /** `null` disables the constructor, e.g. when a custom `fetch` is incompatible with the global one. */
    Request?: (new (
      input: Request | string | URL,
      init?: RequestInit,
    ) => unknown) | null;
    Response?: (new (...args: Array<unknown>) => unknown) | null;
  };
  fetchOptions?: Record<string, unknown>;
  formDataHeaderPolicy?: "content-only" | "legacy";
  formSerializer?: FormSerializerOptions;
  headers?: FaxiosConfigHeaders;
  maxBodyLength?: number;
  maxContentLength?: number;
  method?: StringLiteralsOrString<Method>;
  onDownloadProgress?: (progressEvent: FaxiosProgressEvent) => void;
  onUploadProgress?: (progressEvent: FaxiosProgressEvent) => void;
  params?: Record<string, unknown> | URLSearchParams;
  paramsSchema?: StandardSchemaV1;
  paramsSerializer?: CustomParamsSerializer | ParamsSerializerOptions;
  parseReviver?: (
    this: unknown,
    key: string,
    value: unknown,
    context?: { source?: string; }
  ) => unknown;
  /**
   * Values for `{key}` placeholders in `url` (braces, not `:key`). Only own properties count.
   * Each value goes through `String()` then `encodeURIComponent`. A placeholder whose key is
   * missing, or whose value is `null` or `undefined`, rejects with `ERR_BAD_OPTION_VALUE`. Keys
   * with no matching placeholder are ignored. Without `pathParams`, placeholders are sent literally.
   */
  pathParams?: Record<string, unknown>;
  /**
   * Standard Schema that validates `pathParams` before substitution; its output replaces
   * `pathParams`. Requires `pathParams`, or the request rejects with `ERR_BAD_OPTION_VALUE`.
   * A validation failure, or output that isn't a plain object, rejects with `ERR_BAD_PATH_PARAMS_SCHEMA`.
   */
  pathParamsSchema?: StandardSchemaV1<unknown, Record<string, unknown>>;
  redact?: Array<string>;
  requestSchema?: StandardSchemaV1;
  responseEncoding?: StringLiteralsOrString<responseEncoding>;
  responseSchema?: StandardSchemaV1;
  responseType?: ResponseType;
  signal?: AbortSignal | GenericAbortSignal;
  timeout?: Milliseconds;
  timeoutErrorMessage?: string;
  transformRequest?: Array<FaxiosRequestTransformer> | FaxiosRequestTransformer;
  transformResponse?:
    | Array<FaxiosResponseTransformer>
    | FaxiosResponseTransformer;
  transitional?: TransitionalOptions;
  url?: string;
  validateStatus?: ((status: number) => boolean) | null;
  withCredentials?: boolean;
  withXSRFToken?:
    | ((config: InternalFaxiosRequestConfig) => boolean | undefined)
    | boolean;
  xsrfCookieName?: string;
  xsrfHeaderName?: string;
}

export type SchemaConfig<O, D = unknown> = FaxiosRequestConfig<D> & { responseSchema: StandardSchemaV1<unknown, O>; };

export type RawFaxiosRequestConfig<D = unknown> = FaxiosRequestConfig<D>;

export interface InternalFaxiosRequestConfig<
  D = unknown
> extends FaxiosRequestConfig<D> {
  headers: FaxiosRequestHeaders;
}

// export type RawFaxiosResponseHeaders = Partial<
//   RawFaxiosHeaders & {
//     "set-cookie": Array<string>;
//     "content-type": string;
//     "content-length": string;
//     "cache-control": string;
//     "content-encoding": string;
//     server: string;
//   }
// >;

// export type FaxiosResponseHeaders = RawFaxiosResponseHeaders &
//   Record<string, FaxiosHeaderValue>;

export interface FaxiosResponseHeadersLike {
  // Property access stays loose (matches the FaxiosHeaders runtime class), but
  // get() is precisely typed so the common accessor isn't `unknown`.
  [key: string]: unknown;
  get: (header: string) => FaxiosHeaderValue | undefined;
}

export interface FaxiosResponse<T = unknown, D = unknown> {
  config: InternalFaxiosRequestConfig<D>;
  data: T;
  headers: FaxiosResponseHeadersLike;
  request?: null | Request;
  status: number;
  statusText: string;
}

export type FaxiosPromise<T = unknown> = Promise<FaxiosResponse<T>>;

export interface HeadersDefaults {
  common: RawFaxiosRequestHeaders;
  delete: RawFaxiosRequestHeaders;
  get: RawFaxiosRequestHeaders;
  head: RawFaxiosRequestHeaders;
  link?: RawFaxiosRequestHeaders;
  options?: RawFaxiosRequestHeaders;
  patch: RawFaxiosRequestHeaders;
  post: RawFaxiosRequestHeaders;
  purge?: RawFaxiosRequestHeaders;
  put: RawFaxiosRequestHeaders;
  query?: RawFaxiosRequestHeaders;
  unlink?: RawFaxiosRequestHeaders;
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
  | Partial<HeadersDefaults>
  | RawFaxiosRequestHeaders;

/** Config accepted by `create()`; identical to a request config. */
export type CreateFaxiosDefaults<D = unknown> = FaxiosRequestConfig<D>;

// Reading ctx.config.headers gives the accessor-typed headers; middleware may also assign a new
// FaxiosHeaders (dispatch normalizes it the same way). A plain object isn't accepted, because the
// next middleware would read it back expecting set()/get().
interface ContextHeaders {
  get headers(): FaxiosRequestHeaders;
  set headers(value: FaxiosHeadersInstance | FaxiosRequestHeaders);
}

/**
 * Per-request state passed through `.use()` middleware. Created once per
 * request, after the request config is merged with the instance defaults.
 */
// `{}` defaults match a FaxiosInstance with no plugins, so a plain `FaxiosMiddleware` installs on one.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- see above
export interface FaxiosContext<TOptions = {}, TCapabilities = {}> {
  /** Values provided by installed plugins, shared by every request of the instance. */
  capabilities: TCapabilities;
  /** The merged request config. `headers` is a `FaxiosHeaders` instance. */
  config: Omit<InternalFaxiosRequestConfig, "headers"> & ContextHeaders & TOptions;
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
 * Middleware bundled with the capabilities it requires and provides, typed by one
 * `FaxiosPluginSpec`: `FaxiosPlugin<{ requires?; provides?; options? }>`. Declaring `provides`
 * makes the `provides` value required, so a plugin can't claim a capability it never supplies.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}`: a plugin with no slots
export type FaxiosPlugin<TSpec extends FaxiosPluginSpec & OnlyPluginSlots<TSpec> = {}> =
  FaxiosPluginBase<PluginSlot<TSpec, "requires">, PluginSlot<TSpec, "provides">, PluginSlot<TSpec, "options">>
  & ([keyof PluginSlot<TSpec, "provides">] extends [never]
    ? { provides?: PluginSlot<TSpec, "provides">; }
    : { provides: PluginSlot<TSpec, "provides">; });

/** What `use()` and `eject()` accept as a plugin: the base plus an optional `provides`. Internal. */
export type FaxiosPluginArgument<TRequires = unknown, TProvides = unknown, TOptions = unknown> =
  FaxiosPluginBase<TRequires, TProvides, TOptions> & { provides?: TProvides; };
