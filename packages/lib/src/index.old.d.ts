// TypeScript Version: 4.7
type StringLiteralsOrString<Literals extends string> = Literals | (string & {});

export type AxiosHeaderValue =
  | AxiosHeaders
  | string
  | Array<string>
  | number
  | boolean
  | null;

export interface RawAxiosHeaders {
  [key: string]: AxiosHeaderValue;
}

type MethodsHeaders = Partial<
  {
    [Key in Method as Lowercase<Key>]: AxiosHeaders;
  } & { common: AxiosHeaders }
>;

type AxiosHeaderMatcher =
  | string
  | RegExp
  | ((this: AxiosHeaders, value: string, name: string) => boolean);

type AxiosHeaderParser = (
  this: AxiosHeaders,
  value: AxiosHeaderValue,
  header: string,
) => unknown;

type AxiosHeaderInput = RawAxiosHeaders | AxiosHeaders | string;

export class AxiosHeaders {
  constructor(headers?: AxiosHeaderInput);

  [key: string]: unknown;

  set(
    headerName?: string,
    value?: AxiosHeaderValue,
    rewrite?: boolean | AxiosHeaderMatcher,
  ): AxiosHeaders;
  set(headers?: AxiosHeaderInput, rewrite?: boolean): AxiosHeaders;

  get(headerName: string, parser: RegExp): RegExpExecArray | null;
  get(headerName: string, matcher?: true | AxiosHeaderParser): AxiosHeaderValue;

  has(header: string, matcher?: AxiosHeaderMatcher): boolean;

  delete(header: string | Array<string>, matcher?: AxiosHeaderMatcher): boolean;

  clear(matcher?: AxiosHeaderMatcher): boolean;

  normalize(format: boolean): AxiosHeaders;

  concat(
    ...targets: Array<
      AxiosHeaders | RawAxiosHeaders | string | undefined | null
    >
  ): AxiosHeaders;

  toJSON(asStrings: true): Record<string, string>;
  toJSON(asStrings?: false): Record<string, string | Array<string>>;
  toJSON(asStrings?: boolean): Record<string, string | Array<string>>;

  static from(thing?: AxiosHeaderInput): AxiosHeaders;

  static accessor(header: string | Array<string>): AxiosHeaders;

  static concat(
    ...targets: Array<
      AxiosHeaders | RawAxiosHeaders | string | undefined | null
    >
  ): AxiosHeaders;

  setContentType(
    value: ContentType,
    rewrite?: boolean | AxiosHeaderMatcher,
  ): AxiosHeaders;
  getContentType(parser?: RegExp): RegExpExecArray | null;
  getContentType(matcher?: AxiosHeaderMatcher): AxiosHeaderValue;
  hasContentType(matcher?: AxiosHeaderMatcher): boolean;

  setContentLength(
    value: AxiosHeaderValue,
    rewrite?: boolean | AxiosHeaderMatcher,
  ): AxiosHeaders;
  getContentLength(parser?: RegExp): RegExpExecArray | null;
  getContentLength(matcher?: AxiosHeaderMatcher): AxiosHeaderValue;
  hasContentLength(matcher?: AxiosHeaderMatcher): boolean;

  setAccept(
    value: AxiosHeaderValue,
    rewrite?: boolean | AxiosHeaderMatcher,
  ): AxiosHeaders;
  getAccept(parser?: RegExp): RegExpExecArray | null;
  getAccept(matcher?: AxiosHeaderMatcher): AxiosHeaderValue;
  hasAccept(matcher?: AxiosHeaderMatcher): boolean;

  setUserAgent(
    value: AxiosHeaderValue,
    rewrite?: boolean | AxiosHeaderMatcher,
  ): AxiosHeaders;
  getUserAgent(parser?: RegExp): RegExpExecArray | null;
  getUserAgent(matcher?: AxiosHeaderMatcher): AxiosHeaderValue;
  hasUserAgent(matcher?: AxiosHeaderMatcher): boolean;

  setContentEncoding(
    value: AxiosHeaderValue,
    rewrite?: boolean | AxiosHeaderMatcher,
  ): AxiosHeaders;
  getContentEncoding(parser?: RegExp): RegExpExecArray | null;
  getContentEncoding(matcher?: AxiosHeaderMatcher): AxiosHeaderValue;
  hasContentEncoding(matcher?: AxiosHeaderMatcher): boolean;

  setAuthorization(
    value: AxiosHeaderValue,
    rewrite?: boolean | AxiosHeaderMatcher,
  ): AxiosHeaders;
  getAuthorization(parser?: RegExp): RegExpExecArray | null;
  getAuthorization(matcher?: AxiosHeaderMatcher): AxiosHeaderValue;
  hasAuthorization(matcher?: AxiosHeaderMatcher): boolean;

  getSetCookie(): Array<string>;

  [Symbol.iterator](): IterableIterator<[string, AxiosHeaderValue]>;
}

type CommonRequestHeadersList =
  | "Accept"
  | "Content-Length"
  | "User-Agent"
  | "Content-Encoding"
  | "Authorization"
  | "Location";

type ContentType =
  | AxiosHeaderValue
  | "text/html"
  | "text/plain"
  | "multipart/form-data"
  | "application/json"
  | "application/x-www-form-urlencoded"
  | "application/octet-stream";

export type RawAxiosRequestHeaders = Partial<
  RawAxiosHeaders & {
    [Key in CommonRequestHeadersList]: AxiosHeaderValue;
  } & {
    "Content-Type": ContentType;
  }
>;

export type AxiosRequestHeaders = RawAxiosRequestHeaders & AxiosHeaders;

type CommonResponseHeadersList =
  | "Server"
  | "Content-Type"
  | "Content-Length"
  | "Cache-Control"
  | "Content-Encoding";

type CommonResponseHeaderKey =
  | CommonResponseHeadersList
  | Lowercase<CommonResponseHeadersList>;

type RawCommonResponseHeaders = {
  [Key in CommonResponseHeaderKey]: AxiosHeaderValue;
} & {
  "set-cookie": Array<string>;
};

export type RawAxiosResponseHeaders = Partial<
  RawAxiosHeaders & RawCommonResponseHeaders
>;

export type AxiosResponseHeaders = RawAxiosResponseHeaders & AxiosHeaders;

export interface AxiosRequestTransformer {
  (
    this: InternalAxiosRequestConfig,
    data: unknown,
    headers: AxiosRequestHeaders,
  ): unknown;
}

export interface AxiosResponseTransformer {
  (
    this: InternalAxiosRequestConfig,
    data: unknown,
    headers: AxiosResponseHeaders,
    status?: number,
  ): unknown;
}

export interface AxiosAdapter {
  (config: InternalAxiosRequestConfig): AxiosPromise;
}

export interface AxiosBasicCredentials {
  username: string;
  password: string;
}

export interface AxiosProxyConfig {
  host: string;
  port: number;
  auth?: AxiosBasicCredentials;
  protocol?: string;
}

export enum HttpStatusCode {
  Continue = 100,
  SwitchingProtocols = 101,
  Processing = 102,
  EarlyHints = 103,
  Ok = 200,
  Created = 201,
  Accepted = 202,
  NonAuthoritativeInformation = 203,
  NoContent = 204,
  ResetContent = 205,
  PartialContent = 206,
  MultiStatus = 207,
  AlreadyReported = 208,
  ImUsed = 226,
  MultipleChoices = 300,
  MovedPermanently = 301,
  Found = 302,
  SeeOther = 303,
  NotModified = 304,
  UseProxy = 305,
  Unused = 306,
  TemporaryRedirect = 307,
  PermanentRedirect = 308,
  BadRequest = 400,
  Unauthorized = 401,
  PaymentRequired = 402,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  ProxyAuthenticationRequired = 407,
  RequestTimeout = 408,
  Conflict = 409,
  Gone = 410,
  LengthRequired = 411,
  PreconditionFailed = 412,
  PayloadTooLarge = 413,
  UriTooLong = 414,
  UnsupportedMediaType = 415,
  RangeNotSatisfiable = 416,
  ExpectationFailed = 417,
  ImATeapot = 418,
  MisdirectedRequest = 421,
  UnprocessableEntity = 422,
  Locked = 423,
  FailedDependency = 424,
  TooEarly = 425,
  UpgradeRequired = 426,
  PreconditionRequired = 428,
  TooManyRequests = 429,
  RequestHeaderFieldsTooLarge = 431,
  UnavailableForLegalReasons = 451,
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
  HttpVersionNotSupported = 505,
  VariantAlsoNegotiates = 506,
  InsufficientStorage = 507,
  LoopDetected = 508,
  NotExtended = 510,
  NetworkAuthenticationRequired = 511,
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

export type ResponseType =
  | "arraybuffer"
  | "blob"
  | "document"
  | "json"
  | "text"
  | "stream"
  | "formdata";

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
  onabort?: ((...args: Array<unknown>) => unknown) | null;
  addEventListener?: (...args: Array<unknown>) => unknown;
  removeEventListener?: (...args: Array<unknown>) => unknown;
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

type MaxUploadRate = number;

type MaxDownloadRate = number;

type BrowserProgressEvent = unknown;

export interface AxiosProgressEvent {
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

type Milliseconds = number;

type AxiosAdapterName = StringLiteralsOrString<"xhr" | "http" | "fetch">;

type AxiosAdapterConfig = AxiosAdapter | AxiosAdapterName;

export type AddressFamily = 4 | 6 | undefined;

export interface LookupAddressEntry {
  address: string;
  family?: AddressFamily;
}

export type LookupAddress = string | LookupAddressEntry;

export interface AxiosRequestConfig<D = unknown> {
  url?: string;
  method?: StringLiteralsOrString<Method>;
  baseURL?: string;
  allowAbsoluteUrls?: boolean;
  transformRequest?: AxiosRequestTransformer | Array<AxiosRequestTransformer>;
  transformResponse?:
    | AxiosResponseTransformer
    | Array<AxiosResponseTransformer>;
  headers?: (RawAxiosRequestHeaders & MethodsHeaders) | AxiosHeaders;
  params?: unknown;
  paramsSerializer?: ParamsSerializerOptions | CustomParamsSerializer;
  data?: D;
  timeout?: Milliseconds;
  timeoutErrorMessage?: string;
  withCredentials?: boolean;
  adapter?: AxiosAdapterConfig | Array<AxiosAdapterConfig>;
  auth?: AxiosBasicCredentials;
  responseType?: ResponseType;
  responseEncoding?: StringLiteralsOrString<responseEncoding>;
  xsrfCookieName?: string;
  xsrfHeaderName?: string;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void;
  maxContentLength?: number;
  validateStatus?: ((status: number) => boolean) | null;
  maxBodyLength?: number;
  maxRedirects?: number;
  maxRate?: number | [MaxUploadRate, MaxDownloadRate];
  beforeRedirect?: (
    options: Record<string, unknown>,
    responseDetails: {
      headers: Record<string, string>;
      statusCode: HttpStatusCode;
    },
    requestDetails: {
      headers: Record<string, string>;
      url: string;
      method: string;
    },
  ) => void;
  socketPath?: string | null;
  allowedSocketPaths?: string | Array<string> | null;
  transport?: unknown;
  httpAgent?: unknown;
  httpsAgent?: unknown;
  proxy?: AxiosProxyConfig | false;
  cancelToken?: CancelToken;
  decompress?: boolean;
  transitional?: TransitionalOptions;
  signal?: GenericAbortSignal;
  insecureHTTPParser?: boolean;
  env?: {
    FormData?: new (...args: Array<unknown>) => object;
    fetch?: (
      input: URL | Request | string,
      init?: RequestInit,
    ) => Promise<Response>;
    Request?: new (
      input: URL | Request | string,
      init?: RequestInit,
    ) => Request;
    Response?: new (
      body?:
        | ArrayBuffer
        | ArrayBufferView
        | Blob
        | FormData
        | URLSearchParams
        | string
        | null,
      init?: ResponseInit,
    ) => Response;
  };
  formSerializer?: FormSerializerOptions;
  family?: AddressFamily;
  lookup?:
    | ((
        hostname: string,
        options: object,
        cb: (
          err: Error | null,
          address: LookupAddress | Array<LookupAddress>,
          family?: AddressFamily,
        ) => void,
      ) => void)
    | ((
        hostname: string,
        options: object,
      ) => Promise<
        | [
            address: LookupAddressEntry | Array<LookupAddressEntry>,
            family?: AddressFamily,
          ]
        | LookupAddress
      >);
  withXSRFToken?:
    | boolean
    | ((config: InternalAxiosRequestConfig) => boolean | undefined);
  parseReviver?: (
    this: unknown,
    key: string,
    value: unknown,
    context?: { source?: string },
  ) => unknown;
  fetchOptions?:
    | Omit<RequestInit, "body" | "headers" | "method" | "signal">
    | Record<string, unknown>;
  httpVersion?: 1 | 2;
  http2Options?: Record<string, unknown> & {
    sessionTimeout?: number;
  };
  formDataHeaderPolicy?: "legacy" | "content-only";
  redact?: Array<string>;
  sensitiveHeaders?: Array<string>;
}

// Alias
export type RawAxiosRequestConfig<D = unknown> = AxiosRequestConfig<D>;

export interface InternalAxiosRequestConfig<
  D = unknown,
> extends AxiosRequestConfig<D> {
  headers: AxiosRequestHeaders;
}

export interface HeadersDefaults {
  common: RawAxiosRequestHeaders;
  delete: RawAxiosRequestHeaders;
  get: RawAxiosRequestHeaders;
  head: RawAxiosRequestHeaders;
  post: RawAxiosRequestHeaders;
  put: RawAxiosRequestHeaders;
  patch: RawAxiosRequestHeaders;
  options?: RawAxiosRequestHeaders;
  purge?: RawAxiosRequestHeaders;
  link?: RawAxiosRequestHeaders;
  unlink?: RawAxiosRequestHeaders;
  query?: RawAxiosRequestHeaders;
}

export interface AxiosDefaults<D = unknown> extends Omit<
  AxiosRequestConfig<D>,
  "headers"
> {
  headers: HeadersDefaults;
}

export interface CreateAxiosDefaults<D = unknown> extends Omit<
  AxiosRequestConfig<D>,
  "headers"
> {
  headers?: RawAxiosRequestHeaders | AxiosHeaders | Partial<HeadersDefaults>;
}

export interface AxiosResponse<T = unknown, D = unknown, H = object> {
  data: T;
  status: number;
  statusText: string;
  headers: (H & RawAxiosResponseHeaders) | AxiosResponseHeaders;
  config: InternalAxiosRequestConfig<D>;
  request?: unknown;
}

export class FaxiosError<T = unknown, D = unknown> extends Error {
  constructor(
    message?: string,
    code?: string,
    config?: InternalAxiosRequestConfig<D>,
    request?: unknown,
    response?: AxiosResponse<T, D>,
  );

  config?: InternalAxiosRequestConfig<D>;
  code?: string;
  request?: unknown;
  response?: AxiosResponse<T, D>;
  isAxiosError: boolean;
  status?: number;
  toJSON: () => object;
  cause?: Error;
  event?: BrowserProgressEvent;
  static from<T = unknown, D = unknown>(
    error: Error | unknown,
    code?: string,
    config?: InternalAxiosRequestConfig<D>,
    request?: unknown,
    response?: AxiosResponse<T, D>,
    customProps?: object,
  ): FaxiosError<T, D>;
  static readonly ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
  static readonly ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
  static readonly ERR_BAD_OPTION = "ERR_BAD_OPTION";
  static readonly ERR_NETWORK = "ERR_NETWORK";
  static readonly ERR_DEPRECATED = "ERR_DEPRECATED";
  static readonly ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
  static readonly ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
  static readonly ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
  static readonly ERR_INVALID_URL = "ERR_INVALID_URL";
  static readonly ERR_CANCELED = "ERR_CANCELED";
  static readonly ERR_FORM_DATA_DEPTH_EXCEEDED = "ERR_FORM_DATA_DEPTH_EXCEEDED";
  static readonly ECONNABORTED = "ECONNABORTED";
  static readonly ECONNREFUSED = "ECONNREFUSED";
  static readonly ETIMEDOUT = "ETIMEDOUT";
}

export class CanceledError<T> extends FaxiosError<T> {
  readonly name: "CanceledError";
}

export type AxiosPromise<T = unknown> = Promise<AxiosResponse<T>>;

export interface CancelStatic {
  new (message?: string): Cancel;
}

export interface Cancel {
  message: string | undefined;
}

export interface Canceler {
  (message?: string, config?: AxiosRequestConfig, request?: unknown): void;
}

export interface CancelTokenStatic {
  new (executor: (cancel: Canceler) => void): CancelToken;
  source: () => CancelTokenSource;
}

export interface CancelToken {
  promise: Promise<Cancel>;
  reason?: Cancel;
  throwIfRequested: () => void;
}

export interface CancelTokenSource {
  token: CancelToken;
  cancel: Canceler;
}

export interface AxiosInterceptorOptions {
  synchronous?: boolean;
  runWhen?: ((config: InternalAxiosRequestConfig) => boolean) | null;
}

type AxiosInterceptorFulfilled<T> = (value: T) => T | Promise<T>;
type AxiosInterceptorRejected = (error: unknown) => unknown;

type AxiosRequestInterceptorUse<T> = (
  onFulfilled?: AxiosInterceptorFulfilled<T> | null,
  onRejected?: AxiosInterceptorRejected | null,
  options?: AxiosInterceptorOptions,
) => number;

type AxiosResponseInterceptorUse<T> = (
  onFulfilled?: AxiosInterceptorFulfilled<T> | null,
  onRejected?: AxiosInterceptorRejected | null,
) => number;

interface AxiosInterceptorHandler<T> {
  fulfilled: AxiosInterceptorFulfilled<T>;
  rejected?: AxiosInterceptorRejected;
  synchronous: boolean;
  runWhen?: ((config: InternalAxiosRequestConfig) => boolean) | null;
}

export interface AxiosInterceptorManager<V> {
  use: V extends AxiosResponse
    ? AxiosResponseInterceptorUse<V>
    : AxiosRequestInterceptorUse<V>;
  eject: (id: number) => void;
  clear: () => void;
  handlers?: Array<AxiosInterceptorHandler<V>>;
}

export class Axios {
  constructor(config?: AxiosRequestConfig);
  defaults: AxiosDefaults;
  interceptors: {
    request: AxiosInterceptorManager<InternalAxiosRequestConfig>;
    response: AxiosInterceptorManager<AxiosResponse>;
  };
  getUri(config?: AxiosRequestConfig): string;
  request<T = unknown, R = AxiosResponse<T>, D = unknown>(
    config: AxiosRequestConfig<D>,
  ): Promise<R>;
  get<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  delete<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  head<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  options<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  post<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  put<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  patch<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  postForm<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  putForm<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  patchForm<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
  query<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;
}

export interface AxiosInstance extends Axios {
  <T = unknown, R = AxiosResponse<T>, D = unknown>(
    config: AxiosRequestConfig<D>,
  ): Promise<R>;
  <T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    config?: AxiosRequestConfig<D>,
  ): Promise<R>;

  create: (config?: CreateAxiosDefaults) => AxiosInstance;
  defaults: Omit<AxiosDefaults, "headers"> & {
    headers: HeadersDefaults & {
      [key: string]: AxiosHeaderValue;
    };
  };
}

export interface GenericFormData {
  append: (name: string, value: unknown, options?: unknown) => unknown;
}

export interface GenericHTMLFormElement {
  name: string;
  method: string;
  submit: () => void;
}

export function getAdapter(
  adapters: AxiosAdapterConfig | Array<AxiosAdapterConfig> | undefined,
): AxiosAdapter;

export function toFormData(
  sourceObj: object,
  targetFormData?: GenericFormData,
  options?: FormSerializerOptions,
): GenericFormData;

export function formToJSON(
  form: GenericFormData | GenericHTMLFormElement,
): object;

export function isAxiosError<T = unknown, D = unknown>(
  payload: unknown,
): payload is FaxiosError<T, D>;

export function spread<T, R>(
  callback: (...args: Array<T>) => R,
): (array: Array<T>) => R;

export function isCancel<T = unknown>(
  value: unknown,
): value is CanceledError<T>;

export function all<T>(values: Array<T | Promise<T>>): Promise<Array<T>>;

export function mergeConfig<D = unknown>(
  config1: AxiosRequestConfig<D>,
  config2: AxiosRequestConfig<D>,
): AxiosRequestConfig<D>;

export function create(config?: CreateAxiosDefaults): AxiosInstance;

export interface AxiosStatic extends AxiosInstance {
  Cancel: CancelStatic;
  CancelToken: CancelTokenStatic;
  Axios: typeof Axios;
  FaxiosError: typeof FaxiosError;
  HttpStatusCode: typeof HttpStatusCode;
  readonly VERSION: string;
  isCancel: typeof isCancel;
  all: typeof all;
  spread: typeof spread;
  isAxiosError: typeof isAxiosError;
  toFormData: typeof toFormData;
  formToJSON: typeof formToJSON;
  getAdapter: typeof getAdapter;
  CanceledError: typeof CanceledError;
  AxiosHeaders: typeof AxiosHeaders;
  mergeConfig: typeof mergeConfig;
}

declare const axios: AxiosStatic;

export default axios;
