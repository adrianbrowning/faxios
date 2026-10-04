// @ts-self-types="./types.d.ts"
// Internal shared types — imported by implementation files.
// Public API types in index.d.ts re-export or extend these.

import type { FaxiosHeadersInstance } from "./core/FaxiosHeaders.js";
import type { StandardSchemaV1 } from "./types/standard-schema.js";

export type StringLiteralsOrString<Literals extends string> =
  | Literals
  | (string & {});

export type FaxiosHeaderValue =
  | string
  | Array<string>
  | number
  | boolean
  | null;

export interface RawFaxiosHeaders {
  [key: string]: FaxiosHeaderValue;
}

type UppercaseMethod =
  | "GET"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "POST"
  | "PUT"
  | "PATCH"
  | "PURGE"
  | "LINK"
  | "UNLINK"
  | "QUERY";

export type Method = UppercaseMethod | Lowercase<UppercaseMethod>;

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
  | StringLiteralsOrString<
    | "text/html"
    | "text/plain"
    | "multipart/form-data"
    | "application/json"
    | "application/x-www-form-urlencoded"
    | "application/octet-stream"
    | "application/problem+json"
    | "application/ld+json"
    | "text/event-stream"
    | "application/graphql-response+json"
    | "application/merge-patch+json"
    | "application/json-patch+json"
  >
  | Exclude<FaxiosHeaderValue, string>;

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
  | "json"
  | "text"
  | "stream"
  | "formdata"
  | "response";

type UppercaseResponseEncoding =
  | "ASCII"
  | "ANSI"
  | "BINARY"
  | "BASE64"
  | "BASE64URL"
  | "HEX"
  | "LATIN1"
  | "UCS-2"
  | "UCS2"
  | "UTF-8"
  | "UTF8"
  | "UTF16LE";

export type responseEncoding =
  | UppercaseResponseEncoding
  | Lowercase<UppercaseResponseEncoding>;

export interface TransitionalOptions {
  silentJSONParsing?: boolean;
  forcedJSONParsing?: boolean;
  clarifyTimeoutError?: boolean;
  legacyInterceptorReqResOrdering?: boolean;
  advertiseZstdAcceptEncoding?: boolean;
  validateStatusUndefinedResolves?: boolean;
}

export interface GenericAbortSignal {
  readonly aborted: boolean;
  onabort?: ((event: Event) => void) | null;
  addEventListener?: (...args: Array<unknown>) => unknown;
  removeEventListener?: (...args: Array<unknown>) => unknown;
}

export interface GenericFormData {
  append: (name: string, value: unknown, options?: unknown) => unknown;
}

export interface GenericHTMLFormElement {
  name: string;
  method: string;
  submit: () => void;
}

export interface FormDataVisitorHelpers {
  defaultVisitor: SerializerVisitor;
  convertValue: (value: unknown) => unknown;
  isVisitable: (value: unknown) => boolean;
}

export interface SerializerVisitor {
  (
    this: GenericFormData,
    value: unknown,
    key: string | number,
    path: null | Array<string | number>,
    helpers: FormDataVisitorHelpers,
  ): boolean;
}

export interface SerializerOptions {
  visitor?: SerializerVisitor;
  dots?: boolean;
  metaTokens?: boolean;
  indexes?: boolean | null;
  /** Maximum nesting depth to serialize; deeper objects throw `ERR_FORM_DATA_DEPTH_EXCEEDED`. `Infinity` disables the check. */
  maxDepth?: number;
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
  loaded: number;
  total?: number;
  progress?: number;
  bytes: number;
  rate?: number;
  estimated?: number;
  upload?: boolean;
  download?: boolean;
  event?: BrowserProgressEvent;
  lengthComputable: boolean;
}

export interface FaxiosBasicCredentials {
  username: string;
  password: string;
}

// forward-declared; implemented in core/FaxiosHeaders.ts
// Using a structural type that matches FaxiosHeaders class methods
type HeaderMatcher =
  | string
  | RegExp
  | ((value: string, name: string) => boolean);

type HeaderGetResult = string | Array<string> | Record<string, string> | RegExpExecArray | true | null | undefined;

export type FaxiosRequestHeaders = Record<string, FaxiosHeaderValue> & {
  set: (header: string | Record<string, unknown>, value?: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  get: (header: string, parser?: boolean | RegExp) => HeaderGetResult;
  has: (header: string, matcher?: HeaderMatcher) => boolean;
  delete: (header: string | Array<string>, matcher?: HeaderMatcher) => boolean;
  clear: (matcher?: HeaderMatcher) => boolean;
  normalize: (format?: boolean) => FaxiosRequestHeaders;
  concat: (...targets: Array<unknown>) => FaxiosRequestHeaders;
  getContentType: (matcher?: HeaderMatcher) => HeaderGetResult;
  setContentType: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  hasContentType: (matcher?: HeaderMatcher) => boolean;
  getContentLength: (matcher?: HeaderMatcher) => HeaderGetResult;
  setContentLength: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  hasContentLength: (matcher?: HeaderMatcher) => boolean;
  getAccept: (matcher?: HeaderMatcher) => HeaderGetResult;
  setAccept: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  hasAccept: (matcher?: HeaderMatcher) => boolean;
  getAcceptEncoding: (matcher?: HeaderMatcher) => HeaderGetResult;
  setAcceptEncoding: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  hasAcceptEncoding: (matcher?: HeaderMatcher) => boolean;
  getUserAgent: (matcher?: HeaderMatcher) => HeaderGetResult;
  setUserAgent: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  hasUserAgent: (matcher?: HeaderMatcher) => boolean;

  getAuthorization: (matcher?: HeaderMatcher) => HeaderGetResult;
  setAuthorization: (value: FaxiosHeaderValue, rewrite?: boolean) => FaxiosRequestHeaders;
  hasAuthorization: (matcher?: HeaderMatcher) => boolean;
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
  url?: string;
  method?: StringLiteralsOrString<Method>;
  baseURL?: string;
  allowAbsoluteUrls?: boolean;
  transformRequest?: FaxiosRequestTransformer | Array<FaxiosRequestTransformer>;
  transformResponse?:
    | FaxiosResponseTransformer
    | Array<FaxiosResponseTransformer>;
  headers?: FaxiosConfigHeaders;
  params?: Record<string, unknown> | URLSearchParams;
  paramsSerializer?: ParamsSerializerOptions | CustomParamsSerializer;
  data?: D;
  timeout?: Milliseconds;
  timeoutErrorMessage?: string;
  withCredentials?: boolean;
  auth?: FaxiosBasicCredentials;
  responseType?: ResponseType;
  responseEncoding?: StringLiteralsOrString<responseEncoding>;
  xsrfCookieName?: string;
  xsrfHeaderName?: string;
  onUploadProgress?: (progressEvent: FaxiosProgressEvent) => void;
  onDownloadProgress?: (progressEvent: FaxiosProgressEvent) => void;
  maxContentLength?: number;
  validateStatus?: ((status: number) => boolean) | null;
  maxBodyLength?: number;
  transitional?: TransitionalOptions;
  signal?: AbortSignal | GenericAbortSignal;
  env?: {
    /** Constructed with no arguments to serialize `multipart/form-data` payloads; `null` falls back to the global `FormData`. */
    FormData?: (new () => object) | null;
    fetch?: (
      input: string | URL | Request,
      init?: RequestInit
    ) => Promise<Response>;
    /** `null` disables the constructor, e.g. when a custom `fetch` is incompatible with the global one. */
    Request?: (new (
      input: string | URL | Request,
      init?: RequestInit,
    ) => unknown) | null;
    Response?: (new (...args: Array<unknown>) => unknown) | null;
  };
  formSerializer?: FormSerializerOptions;
  withXSRFToken?:
    | boolean
    | ((config: InternalFaxiosRequestConfig) => boolean | undefined);
  parseReviver?: (
    this: unknown,
    key: string,
    value: unknown,
    context?: { source?: string; }
  ) => unknown;
  fetchOptions?: Record<string, unknown>;
  formDataHeaderPolicy?: "legacy" | "content-only";
  redact?: Array<string>;
  responseSchema?: StandardSchemaV1;
  requestSchema?: StandardSchemaV1;
  paramsSchema?: StandardSchemaV1;
  pathParams?: Record<string, unknown>;
  pathParamsSchema?: StandardSchemaV1<unknown, Record<string, unknown>>;
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
  data: T;
  status: number;
  statusText: string;
  headers: FaxiosResponseHeadersLike;
  config: InternalFaxiosRequestConfig<D>;
  request?: Request | null;
}

export type FaxiosPromise<T = unknown> = Promise<FaxiosResponse<T>>;

export interface HeadersDefaults {
  common: RawFaxiosRequestHeaders;
  delete: RawFaxiosRequestHeaders;
  get: RawFaxiosRequestHeaders;
  head: RawFaxiosRequestHeaders;
  post: RawFaxiosRequestHeaders;
  put: RawFaxiosRequestHeaders;
  patch: RawFaxiosRequestHeaders;
  options?: RawFaxiosRequestHeaders;
  purge?: RawFaxiosRequestHeaders;
  link?: RawFaxiosRequestHeaders;
  unlink?: RawFaxiosRequestHeaders;
  query?: RawFaxiosRequestHeaders;
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
  | RawFaxiosRequestHeaders
  | Partial<HeadersDefaults>
  | FaxiosHeadersInstance;

/** Config accepted by `create()`; identical to a request config. */
export type CreateFaxiosDefaults<D = unknown> = FaxiosRequestConfig<D>;

/**
 * Per-request state passed through `.use()` middleware. Created once per
 * request, after the request config is merged with the instance defaults.
 */
export interface FaxiosContext<TOptions = unknown, TCapabilities = unknown> {
  /** The merged request config. `headers` is a `FaxiosHeaders` instance. */
  config: InternalFaxiosRequestConfig & TOptions;
  /** Null-prototype scratch space shared by middleware for this request only. */
  state: Record<PropertyKey, unknown>;
  /** Values provided by installed plugins, shared by every request of the instance. */
  capabilities: TCapabilities;
}

/** Runs the rest of the middleware chain, then dispatches a copy of `ctx.config`. */
export type FaxiosNext = (ctx: FaxiosContext) => Promise<FaxiosResponse>;

/**
 * Onion-style lifecycle hook: code before `await next(ctx)` runs on the way in,
 * code after it on the way out. Returning without calling `next` skips dispatch.
 */
export type FaxiosMiddleware<TOptions = unknown, TCapabilities = unknown> = (
  ctx: FaxiosContext<TOptions, TCapabilities>,
  next: FaxiosNext
) => Promise<FaxiosResponse>;

/** Middleware bundled with the capabilities it provides to other plugins. */
export interface FaxiosPlugin<TRequires = unknown, TProvides = unknown, TOptions = unknown> {
  name: string;
  provides?: TProvides;
  middleware: FaxiosMiddleware<TOptions, TRequires & TProvides>;
}

export interface FaxiosInterceptorOptions {
  synchronous?: boolean;
  runWhen?: ((config: InternalFaxiosRequestConfig) => boolean) | null;
}

export type FaxiosInterceptorFulfilled<T> = (value: T) => T | Promise<T>;
export type FaxiosInterceptorRejected = (error: unknown) => unknown;

export interface FaxiosInterceptorHandler<T> {
  fulfilled: FaxiosInterceptorFulfilled<T>;
  rejected?: FaxiosInterceptorRejected;
  synchronous: boolean;
  runWhen?: ((config: InternalFaxiosRequestConfig) => boolean) | null;
}
