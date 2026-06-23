// Internal shared types — imported by implementation files.
// Public API types in index.d.ts re-export or extend these.

export type StringLiteralsOrString<Literals extends string> = Literals | (string & {});

export type AxiosHeaderValue = string | Array<string> | number | boolean | null;

export interface RawAxiosHeaders {
  [key: string]: AxiosHeaderValue;
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

export type responseEncoding = (
  | UppercaseResponseEncoding
  | Lowercase<UppercaseResponseEncoding>
);

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
    helpers: FormDataVisitorHelpers
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
type Milliseconds = number;

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

export type AddressFamily = 4 | 6 | undefined;

export interface LookupAddressEntry {
  address: string;
  family?: AddressFamily;
}

export type LookupAddress = string | LookupAddressEntry;

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

// forward-declared; implemented in core/AxiosHeaders.ts
// Using a structural type that matches AxiosHeaders class methods
export type AxiosRequestHeaders = Record<string, unknown> & {
  set: (header: string, value?: unknown, rewrite?: unknown) => unknown;
  get: (header: string, parser?: unknown) => unknown;
  has: (header: string, matcher?: unknown) => boolean;
  delete: (header: string | Array<string>, matcher?: unknown) => boolean;
  clear: (matcher?: unknown) => boolean;
  normalize: (format?: boolean) => unknown;
  concat: (...targets: Array<unknown>) => unknown;
  getContentType: (matcher?: unknown) => unknown;
  setContentType: (value: unknown, rewrite?: unknown) => unknown;
  hasContentType: (matcher?: unknown) => boolean;
  getContentLength: (matcher?: unknown) => unknown;
  setContentLength: (value: unknown, rewrite?: unknown) => unknown;
  hasContentLength: (matcher?: unknown) => boolean;
  getAccept: (matcher?: unknown) => unknown;
  setAccept: (value: unknown, rewrite?: unknown) => unknown;
  hasAccept: (matcher?: unknown) => boolean;
  getUserAgent: (matcher?: unknown) => unknown;
  setUserAgent: (value: unknown, rewrite?: unknown) => unknown;
  hasUserAgent: (matcher?: unknown) => boolean;
  getContentEncoding: (matcher?: unknown) => unknown;
  setContentEncoding: (value: unknown, rewrite?: unknown) => unknown;
  hasContentEncoding: (matcher?: unknown) => boolean;
  getAuthorization: (matcher?: unknown) => unknown;
  setAuthorization: (value: unknown, rewrite?: unknown) => unknown;
  hasAuthorization: (matcher?: unknown) => boolean;
  toJSON: (asStrings?: boolean) => Record<string, unknown>;
};

export type AxiosAdapterName = StringLiteralsOrString<"xhr" | "http" | "fetch">;

export interface AxiosAdapter {
  (config: InternalAxiosRequestConfig): Promise<AxiosResponse>;
}

export type AxiosAdapterConfig = AxiosAdapter | AxiosAdapterName;

export interface AxiosRequestTransformer {
  (this: InternalAxiosRequestConfig, data: unknown, headers: AxiosRequestHeaders): unknown;
}

export interface AxiosResponseTransformer {
  (
    this: InternalAxiosRequestConfig,
    data: unknown,
    headers: RawAxiosHeaders,
    status?: number
  ): unknown;
}

export interface AxiosRequestConfig<D = unknown> {
  url?: string;
  method?: StringLiteralsOrString<Method>;
  baseURL?: string;
  allowAbsoluteUrls?: boolean;
  transformRequest?: AxiosRequestTransformer | Array<AxiosRequestTransformer>;
  transformResponse?: AxiosResponseTransformer | Array<AxiosResponseTransformer>;
  headers?: Record<string, unknown>;
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
      statusCode: number;
    },
    requestDetails: {
      headers: Record<string, string>;
      url: string;
      method: string;
    }
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
    fetch?: (input: unknown, init?: unknown) => Promise<unknown>;
    Request?: new (...args: Array<unknown>) => unknown;
    Response?: new (...args: Array<unknown>) => unknown;
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
        family?: AddressFamily
      ) => void
    ) => void)
    | ((
      hostname: string,
      options: object
    ) => Promise<
        [address: LookupAddressEntry | Array<LookupAddressEntry>, family?: AddressFamily] | LookupAddress
    >);
  withXSRFToken?: boolean | ((config: InternalAxiosRequestConfig) => boolean | undefined);
  parseReviver?: (this: unknown, key: string, value: unknown, context?: { source?: string; }) => unknown;
  fetchOptions?: Record<string, unknown>;
  httpVersion?: 1 | 2;
  http2Options?: Record<string, unknown> & {
    sessionTimeout?: number;
  };
  formDataHeaderPolicy?: "legacy" | "content-only";
  redact?: Array<string>;
  sensitiveHeaders?: Array<string>;
}

export type RawAxiosRequestConfig<D = unknown> = AxiosRequestConfig<D>;

export interface InternalAxiosRequestConfig<D = unknown> extends AxiosRequestConfig<D> {
  headers: AxiosRequestHeaders;
}

export type RawAxiosResponseHeaders = Partial<RawAxiosHeaders & {
  "set-cookie": Array<string>;
  "content-type": string;
  "content-length": string;
  "cache-control": string;
  "content-encoding": string;
  server: string;
}>;

export type AxiosResponseHeaders = RawAxiosResponseHeaders & Record<string, AxiosHeaderValue>;

export interface AxiosResponse<T = unknown, D = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders | Record<string, unknown>;
  config: InternalAxiosRequestConfig<D>;
  request?: unknown;
}

export type AxiosPromise<T = unknown> = Promise<AxiosResponse<T>>;

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

export interface AxiosDefaults<D = unknown> extends Omit<AxiosRequestConfig<D>, "headers"> {
  headers: HeadersDefaults;
}

export interface CreateAxiosDefaults<D = unknown> extends Omit<AxiosRequestConfig<D>, "headers"> {
  headers?: RawAxiosRequestHeaders | Partial<HeadersDefaults>;
}

export interface Cancel {
  message: string | undefined;
}

export interface Canceler {
  (message?: string, config?: AxiosRequestConfig, request?: unknown): void;
}

export interface CancelToken {
  promise: Promise<Cancel>;
  reason?: Cancel;
  throwIfRequested: () => void;
  subscribe: (listener: (cancel: Cancel) => void) => void;
  unsubscribe: (listener: (cancel: Cancel) => void) => void;
  toAbortSignal: () => AbortSignal & { unsubscribe?: () => void; };
}

export interface CancelTokenSource {
  token: CancelToken;
  cancel: Canceler;
}

export interface CancelTokenStatic {
  new (executor: (cancel: Canceler) => void): CancelToken;
  source: () => CancelTokenSource;
}

export interface AxiosInterceptorOptions {
  synchronous?: boolean;
  runWhen?: ((config: InternalAxiosRequestConfig) => boolean) | null;
}

export type AxiosInterceptorFulfilled<T> = (value: T) => T | Promise<T>;
export type AxiosInterceptorRejected = (error: unknown) => unknown;

export interface AxiosInterceptorHandler<T> {
  fulfilled: AxiosInterceptorFulfilled<T>;
  rejected?: AxiosInterceptorRejected;
  synchronous: boolean;
  runWhen?: ((config: InternalAxiosRequestConfig) => boolean) | null;
}
