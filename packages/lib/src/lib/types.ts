// @ts-self-types="./types.d.ts"
// Internal shared types — imported by implementation files.
// Public API types in index.d.ts re-export or extend these.

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
  | "Content-Length"
  | "User-Agent"
  | "Content-Encoding"
  | "Authorization"
  | "Location";

type ContentType =
  | FaxiosHeaderValue
  | "text/html"
  | "text/plain"
  | "multipart/form-data"
  | "application/json"
  | "application/x-www-form-urlencoded"
  | "application/octet-stream";

export type RawFaxiosRequestHeaders = Partial<
  RawFaxiosHeaders & {
    [Key in CommonRequestHeadersList]: FaxiosHeaderValue;
  } & {
    "Content-Type": ContentType;
  }
>;

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
}

// tslint:disable-next-line
export type FormSerializerOptions = SerializerOptions;

export interface ParamEncoder {
  (value: unknown, defaultEncoder: (value: unknown) => unknown): unknown;
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

type HeaderRewrite =
  | boolean
  | ((value: string, name: string) => boolean);

type HeaderGetResult = string | Array<string> | Record<string, string> | RegExpExecArray | true | null | undefined;

export type FaxiosRequestHeaders = Record<string, FaxiosHeaderValue> & {
  set: (header: string | Record<string, unknown>, value?: FaxiosHeaderValue, rewrite?: HeaderRewrite) => FaxiosRequestHeaders;
  get: (header: string, parser?: boolean | RegExp) => HeaderGetResult;
  has: (header: string, matcher?: HeaderMatcher) => boolean;
  delete: (header: string | Array<string>, matcher?: HeaderMatcher) => boolean;
  clear: (matcher?: HeaderMatcher) => boolean;
  normalize: (format?: boolean) => FaxiosRequestHeaders;
  concat: (...targets: Array<unknown>) => FaxiosRequestHeaders;
  getContentType: (matcher?: HeaderMatcher) => HeaderGetResult;
  setContentType: (value: FaxiosHeaderValue, rewrite?: HeaderRewrite) => FaxiosRequestHeaders;
  hasContentType: (matcher?: HeaderMatcher) => boolean;
  getContentLength: (matcher?: HeaderMatcher) => HeaderGetResult;
  setContentLength: (value: FaxiosHeaderValue, rewrite?: HeaderRewrite) => FaxiosRequestHeaders;
  hasContentLength: (matcher?: HeaderMatcher) => boolean;
  getAccept: (matcher?: HeaderMatcher) => HeaderGetResult;
  setAccept: (value: FaxiosHeaderValue, rewrite?: HeaderRewrite) => FaxiosRequestHeaders;
  hasAccept: (matcher?: HeaderMatcher) => boolean;
  getUserAgent: (matcher?: HeaderMatcher) => HeaderGetResult;
  setUserAgent: (value: FaxiosHeaderValue, rewrite?: HeaderRewrite) => FaxiosRequestHeaders;
  hasUserAgent: (matcher?: HeaderMatcher) => boolean;
  getContentEncoding: (matcher?: HeaderMatcher) => HeaderGetResult;
  setContentEncoding: (value: FaxiosHeaderValue, rewrite?: HeaderRewrite) => FaxiosRequestHeaders;
  hasContentEncoding: (matcher?: HeaderMatcher) => boolean;
  getAuthorization: (matcher?: HeaderMatcher) => HeaderGetResult;
  setAuthorization: (value: FaxiosHeaderValue, rewrite?: HeaderRewrite) => FaxiosRequestHeaders;
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
  headers?: Record<string, unknown>;
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
    FormData?: new (...args: Array<unknown>) => object;
    fetch?: (
      input: string | URL | Request,
      init?: RequestInit
    ) => Promise<Response>;
    Request?: new (
      input: string | URL | Request,
      init?: RequestInit,
    ) => unknown;
    Response?: new (...args: Array<unknown>) => unknown;
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
}

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

export interface CreateFaxiosDefaults<D = unknown> extends Omit<
  FaxiosRequestConfig<D>,
  "headers"
> {
  headers?: RawFaxiosRequestHeaders | Partial<HeadersDefaults>;
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
