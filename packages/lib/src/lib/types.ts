// Internal shared types — imported by implementation files.
// Public API types in index.d.ts re-export or extend these.

export type StringLiteralsOrString<Literals extends string> = Literals | (string & {});

export type FaxiosHeaderValue = string | Array<string> | number | boolean | null;

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

export type AddressFamily = 4 | 6 | undefined;

export interface LookupAddressEntry {
  address: string;
  family?: AddressFamily;
}

export type LookupAddress = string | LookupAddressEntry;

export interface FaxiosBasicCredentials {
  username: string;
  password: string;
}

export interface FaxiosProxyConfig {
  host: string;
  port: number;
  auth?: FaxiosBasicCredentials;
  protocol?: string;
}

// forward-declared; implemented in core/FaxiosHeaders.ts
// Using a structural type that matches FaxiosHeaders class methods
export type FaxiosRequestHeaders = Record<string, unknown> & {
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

export type FaxiosAdapterName = StringLiteralsOrString<"xhr" | "http" | "fetch">;

export interface FaxiosAdapter {
  (config: InternalFaxiosRequestConfig): Promise<FaxiosResponse>;
}

export type FaxiosAdapterConfig = FaxiosAdapter | FaxiosAdapterName;

export interface FaxiosRequestTransformer {
  (this: InternalFaxiosRequestConfig, data: unknown, headers: FaxiosRequestHeaders): unknown;
}

export interface FaxiosResponseTransformer {
  (
    this: InternalFaxiosRequestConfig,
    data: unknown,
    headers: RawFaxiosHeaders,
    status?: number
  ): unknown;
}

export interface FaxiosRequestConfig<D = unknown> {
  url?: string;
  method?: StringLiteralsOrString<Method>;
  baseURL?: string;
  allowAbsoluteUrls?: boolean;
  transformRequest?: FaxiosRequestTransformer | Array<FaxiosRequestTransformer>;
  transformResponse?: FaxiosResponseTransformer | Array<FaxiosResponseTransformer>;
  headers?: Record<string, unknown>;
  params?: unknown;
  paramsSerializer?: ParamsSerializerOptions | CustomParamsSerializer;
  data?: D;
  timeout?: Milliseconds;
  timeoutErrorMessage?: string;
  withCredentials?: boolean;
  adapter?: FaxiosAdapterConfig | Array<FaxiosAdapterConfig>;
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
  proxy?: FaxiosProxyConfig | false;
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
  withXSRFToken?: boolean | ((config: InternalFaxiosRequestConfig) => boolean | undefined);
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

export type RawFaxiosRequestConfig<D = unknown> = FaxiosRequestConfig<D>;

export interface InternalFaxiosRequestConfig<D = unknown> extends FaxiosRequestConfig<D> {
  headers: FaxiosRequestHeaders;
}

export type RawFaxiosResponseHeaders = Partial<RawFaxiosHeaders & {
  "set-cookie": Array<string>;
  "content-type": string;
  "content-length": string;
  "cache-control": string;
  "content-encoding": string;
  server: string;
}>;

export type FaxiosResponseHeaders = RawFaxiosResponseHeaders & Record<string, FaxiosHeaderValue>;

export interface FaxiosResponse<T = unknown, D = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: RawFaxiosResponseHeaders | FaxiosResponseHeaders | Record<string, unknown>;
  config: InternalFaxiosRequestConfig<D>;
  request?: unknown;
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

export interface FaxiosDefaults<D = unknown> extends Omit<FaxiosRequestConfig<D>, "headers"> {
  headers: HeadersDefaults;
}

export interface CreateFaxiosDefaults<D = unknown> extends Omit<FaxiosRequestConfig<D>, "headers"> {
  headers?: RawFaxiosRequestHeaders | Partial<HeadersDefaults>;
}

export interface Cancel {
  message: string | undefined;
}

export interface Canceler {
  (message?: string, config?: FaxiosRequestConfig, request?: unknown): void;
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
