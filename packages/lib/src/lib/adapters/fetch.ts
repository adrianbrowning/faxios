import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import prepareRequest from "../core/prepareRequest.js";
import type { RequestBodies } from "../core/requestDeadline.js";
import resolveBodyContentType from "../core/resolveBodyContentType.js";
import { settle } from "../core/settle.js";
import { VERSION } from "../env/data.js";
import composeSignals from "../helpers/composeSignals.js";
import estimateDataURLDecodedBytes from "../helpers/estimateDataURLDecodedBytes.js";
import { progressReporter } from "../helpers/progressEventReducer.js";
import { toByteStringHeaderObject } from "../helpers/sanitizeHeaderValue.js";
import { trackStream } from "../helpers/trackStream.js";
import utf8ByteLength from "../helpers/utf8ByteLength.js";
import platform from "../platform.js";
import type {
  FaxiosProgressEvent,
  FaxiosResponse,
  InternalFaxiosRequestConfig
} from "../types.js";
import { findKey, getSafeProp, hasOwnInPrototypeChain, hasOwnProp, isArrayBuffer, isArrayBufferView, isBlob, isFunction, isObject, isReadableStream, isRequest, isResponse, isSpecCompliantForm, isStream, isString, isURLSearchParams, toFiniteNumber } from "../utils.js";
import {
  bodyTooLarge,
  checkDeclaredContentLength,
  checkMaterializedSize,
  contentTooLarge,
  handleFetchCaughtError,
  requireRequestURL
} from "./fetch-helpers.js";
import type { ComposedSignal, FetchContext } from "./fetch-helpers.js";

// btoa is a global in Node 16+ and browsers; accessed via globalThis for no-DOM lib compat
const _btoa: (data: string) => string = (
  globalThis as unknown as Record<string, unknown>
)["btoa"] as (data: string) => string;
type AnyConstructor = new (...args: Array<unknown>) => unknown;
type FetchFn = (input: unknown, init?: unknown) => Promise<AnyResponse>;
type AnyResponse = {
  [key: string]: unknown;
  arrayBuffer: () => Promise<ArrayBuffer>;
  body: unknown;
  headers: {
    [key: string]: unknown;
    get: (name: string) => null | string;
    has: (name: string) => boolean;
  };
  status: number;
  statusText: string;
};
type AnyRequest = {
  [key: string]: unknown;
  arrayBuffer: () => Promise<ArrayBuffer>;
  body: null | { cancel: () => Promise<void>; };
  headers: {
    get: (name: string) => null | string;
    has: (name: string) => boolean;
  };
};

const DEFAULT_CHUNK_SIZE = 64 * 1024;

const textEncoder = new TextEncoder();

// Web stream bodies this adapter has sent. fetch can read a stream without leaving it locked,
// and there's no portable "disturbed" check, so a second send is caught here.
const sentStreamBodies = new WeakSet<object>();

// A stream body can be read once. Middleware that calls next() again after a try read it
// would send an empty body (Node stream) or get an uncoded TypeError from fetch (web stream).
const rejectUsedStreamBody = (data: unknown, config: InternalFaxiosRequestConfig): void => {
  const body = data as { bodyUsed?: unknown; destroyed?: unknown; locked?: unknown; readableDidRead?: unknown; readableEnded?: unknown; };
  if (
    (isReadableStream(data) && (body.locked === true || sentStreamBodies.has(body))) ||
    ((isRequest(data) || isResponse(data)) && body.bodyUsed === true) ||
    (isStream(data) && (body.readableDidRead === true || body.readableEnded === true || body.destroyed === true))
  ) {
    throw new FaxiosError(
      "Request body stream was already used and can't be sent again; pass a new body for each try",
      FaxiosError.ERR_BAD_REQUEST,
      config
    );
  }
};

// Called right before fetch: a try that failed before that left a web stream body unread, so a
// later try can still send it.
const markStreamBodySent = (data: unknown): void => {
  if (isReadableStream(data)) sentStreamBodies.add(data);
};

// The response, or a promise rejected with its status error, settled now so the adapter can
// return it after its catch. A throwing validateStatus still throws here, into that catch.
const settleByStatus = (response: FaxiosResponse): Promise<FaxiosResponse> => {
  let outcome: Promise<FaxiosResponse> | undefined;
  settle(value => {
    outcome = Promise.resolve(value);
  }, reason => {
    outcome = Promise.reject(reason);
  }, response);
  return outcome!;
};

const isBrowserRuntime = platform.hasStandardBrowserEnv || platform.hasStandardBrowserWebWorkerEnv;

// Server runtimes default User-Agent to their own (e.g. "node"), so name faxios there.
// Browsers send their own User-Agent; setting one makes every cross-origin request
// need a CORS preflight that most APIs don't allow.
const setsUserAgent = !isBrowserRuntime;
const applyDefaultUserAgent = (headers: FaxiosHeaders): void => {
  if (setsUserAgent) headers.set("User-Agent", "faxios/" + VERSION, false);
};

/**
 * Encode a UTF-8 string to a Latin-1 byte string for use with btoa().
 * This is a modern replacement for the deprecated unescape(encodeURIComponent(str)) pattern.
 *
 * @param {string} str The string to encode
 *
 * @returns {string} UTF-8 bytes as a Latin-1 string
 */
const encodeUTF8 = (str: string): string =>
  encodeURIComponent(str).replace(
    /%([0-9A-F]{2})/gi,
    (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))
  );

// Node's WHATWG URL parser returns `username` and `password` percent-encoded.
// Decode before composing the `auth` option so credentials such as
// `my%40email.com:pass` are sent as `my@email.com:pass`. Falls back to the
// original value for malformed input so a bad encoding never throws.
const decodeURIComponentSafe = (value: unknown): unknown => {
  if (!isString(value)) {
    return value;
  }

  try {
    return decodeURIComponent(value as string);
  }
  catch {
    return value;
  }
};

const test = (
  fn: (...args: Array<unknown>) => unknown,
  ...args: Array<unknown>
): boolean => {
  try {
    return !!fn(...args);
  }
  catch {
    return false;
  }
};

const maybeWithAuthCredentials = (url: string): boolean => {
  const protocolIndex = url.indexOf("://");
  const urlToCheck = protocolIndex !== -1 ? url.slice(protocolIndex + 3) : url;
  // Only `@` indicates credentials in the authority; `:` alone is a port separator.
  return urlToCheck.includes("@");
};

// RequestInit members faxios sets itself; the same keys in `fetchOptions` are ignored.
const FAXIOS_INIT_KEYS: Record<string, true> = {
  body: true,
  credentials: true,
  duplex: true,
  headers: true,
  method: true,
  signal: true,
};

// Spec defaults written as own init members when the caller sets none. undici converts the init
// into a plain dictionary and reads absent members from it, so an absent member still picks up a
// polluted Object.prototype value; an own default leaves nothing to inherit.
const REQUEST_INIT_DEFAULTS: Record<string, unknown> = {
  cache: "default",
  integrity: "",
  keepalive: false,
  mode: "cors",
  redirect: "follow",
  referrer: "about:client",
  referrerPolicy: "",
};

// Where undici (Node's fetch) keeps its global dispatcher.
const UNDICI_GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1");

type FetchEnv = {
  fetch?: unknown;
  Request?: unknown;
  Response?: unknown;
};

// `body` is the request body as transformRequest left it; `config.data` stays the caller's value.
// `url` is the URL dispatch resolved (resolveRequestURL); `config.url` stays the caller's template.
// `bodies`: the request's stream bodies, which core keeps under the request's signal.
type FetchAdapter = (config: InternalFaxiosRequestConfig, body: unknown, url: string, bodies?: RequestBodies) => Promise<unknown>;

// Own reads only: a polluted Object.prototype.fetch must never become the transport.
const readOwn = (obj: unknown, key: string): unknown =>
  typeof obj === "object" && obj !== null && hasOwnProp(obj, key) ? Reflect.get(obj, key) : undefined;
const ownEnv = (config: unknown, key: keyof FetchEnv): unknown => readOwn(readOwn(config, "env"), key);

// What the runtime's fetch side supports. Feature detection depends only on the Request and
// Response constructors, so one record serves every `env.fetch`.
type FetchRuntime = {
  // Outside browsers a FormData body under maxBodyLength is streamed and counted as fetch reads
  // it; browsers can't send a stream body (see buildUploadStream).
  countsFormDataWhileSent: boolean;
  // Cloudflare Workers throws when credentials are defined
  // see https://github.com/cloudflare/workerd/issues/902
  isCredentialsSupported: boolean;
  isReadableStreamSupported: boolean;
  // Whether `new Request(request, { body: null })` keeps the request's body (see fetchInitFor).
  nullKeepsBody: boolean;
  // Undefined where the runtime has none or `env` disables it.
  Request: AnyConstructor | undefined;
  // Only members this runtime's Request exposes, so an engine that rejects members it doesn't
  // implement (Cloudflare Workers) is never sent one.
  requestInitDefaults: Array<[string, unknown]>;
  resolvers: Record<string, (res: AnyResponse, config: InternalFaxiosRequestConfig) => unknown>;
  Response: AnyConstructor | undefined;
  // `ReadableStream.from`, which turns a Node stream body into a web stream.
  streamFrom: ((source: unknown) => unknown) | undefined;
  supportsRequestStream: boolean;
  supportsResponseStream: boolean;
};

// The per-request state the adapter's steps share.
type RequestContext = FetchContext & {
  headers: FaxiosHeaders;
  onDownloadProgress: unknown;
  // Browsers can't be given a stream body for upload progress: Chromium sends one only over
  // HTTP/2 or later and WebKit not at all, so the upload would fail. onUploadProgress isn't
  // called there (#209), so it is undefined.
  onUploadProgress: unknown;
  runtime: FetchRuntime;
  // GET and HEAD send no body.
  sendsBody: boolean;
  // `responseType: "stream"` where the runtime has stream responses.
  streamsResponse: boolean;
};

const RESPONSE_TYPES = [ "text", "arrayBuffer", "blob", "formData", "stream" ];

// How each responseType reads the response; `stream` hands over the body where the runtime has
// stream responses.
const buildResolvers = (supportsResponseStream: boolean): FetchRuntime["resolvers"] => {
  const resolvers: FetchRuntime["resolvers"] = {};
  for (const type of RESPONSE_TYPES) {
    resolvers[type] = type === "stream" && supportsResponseStream
      ? (res: AnyResponse) => res.body
      : (res: AnyResponse, config: InternalFaxiosRequestConfig) => {
        const method = res[type];

        if (method) {
          return (method as (this: AnyResponse) => unknown).call(res);
        }

        throw new FaxiosError(
          `Response type '${type}' is not supported`,
          FaxiosError.ERR_NOT_SUPPORT,
          config
        );
      };
  }

  return resolvers;
};

// Whether `new Request(request, { body: null })` keeps the request's body. Node and Deno keep it
// (an own `null` there means "no new body"); Bun replaces it with no body. Probed once per
// Request constructor; a constructor that can't be probed counts as Bun-like.
const probeNullKeepsBody = (Request: AnyConstructor): boolean => test(() => {
  const base = new Request("https://x.invalid/", { method: "POST", body: "x" }) as AnyRequest;
  const init = Object.assign(Object.create(null) as Record<string, unknown>, { body: null });
  return (new Request(base, init) as AnyRequest).body !== null;
});

const probeRuntime = (env: Omit<FetchEnv, "fetch">): FetchRuntime => {
  const ReadableStream = Reflect.get(globalThis, "ReadableStream") as
    | (AnyConstructor & { from?: (source: unknown) => unknown; })
    | undefined;
  // `undefined` falls back to the global constructor; `null` disables it.
  const RequestCtor = env.Request === undefined ? Reflect.get(globalThis, "Request") : env.Request;
  const ResponseCtor = env.Response === undefined ? Reflect.get(globalThis, "Response") : env.Response;
  const Request = isFunction(RequestCtor) ? RequestCtor as AnyConstructor : undefined;
  const Response = isFunction(ResponseCtor) ? ResponseCtor as AnyConstructor : undefined;
  const isReadableStreamSupported = isFunction(ReadableStream);

  const supportsRequestStream =
    Request !== undefined &&
    isReadableStreamSupported &&
    test(() => {
      let duplexAccessed = false;

      const request = new Request(platform.origin, {
        body: new (ReadableStream as AnyConstructor)(),
        method: "POST",
        get duplex() {
          duplexAccessed = true;
          return "half";
        },
      }) as AnyRequest;

      const hasContentType = request.headers.has("Content-Type");

      if (request.body != null) {
        request.body.cancel().catch(() => {});
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      return duplexAccessed && !hasContentType;
    });

  const supportsResponseStream =
    Response !== undefined &&
    isReadableStreamSupported &&
    test(() => isReadableStream((new Response("") as AnyResponse).body));

  const from = ReadableStream?.from;
  return {
    countsFormDataWhileSent: !isBrowserRuntime && supportsRequestStream,
    isCredentialsSupported: Request !== undefined && "credentials" in (Request.prototype as object),
    isReadableStreamSupported,
    nullKeepsBody: Request !== undefined && probeNullKeepsBody(Request),
    Request,
    requestInitDefaults: Object.entries(REQUEST_INIT_DEFAULTS).filter(([ key ]) =>
      Request !== undefined && hasOwnInPrototypeChain(Request.prototype, key)),
    resolvers: buildResolvers(supportsResponseStream),
    Response,
    streamFrom: typeof from === "function" ? from.bind(ReadableStream) : undefined,
    supportsRequestStream,
    supportsResponseStream,
  };
};

// Null prototype: WebIDL reads every RequestInit member with Get, which walks the prototype
// chain, so a plain object literal would let a polluted Object.prototype.redirect, .integrity,
// .mode or undici .dispatcher apply to every request. Every own enumerable key of fetchOptions
// is copied, so runtime extensions (Next.js `next`, Workers `cf`, Bun `tls`) still pass through;
// inherited keys never do. The caller sets signal, method, headers, body, duplex, credentials.
// This init builds the Request; fetch gets the init fetchInitFor derives from it.
const buildRequestInit = (
  ctx: RequestContext,
  options: { data: unknown; envFetch: FetchFn | undefined; fetchOptions: unknown; withCredentials: boolean | string | undefined; }
): Record<string, unknown> => {
  const init: Record<string, unknown> = Object.create(null);
  for (const [ key, value ] of ctx.runtime.requestInitDefaults) init[key] = value;
  // Node's global fetch reads `dispatcher` the same way; pin it to undici's own global one.
  if (!options.envFetch && hasOwnProp(globalThis, UNDICI_GLOBAL_DISPATCHER)) {
    init["dispatcher"] = (globalThis as Record<PropertyKey, unknown>)[UNDICI_GLOBAL_DISPATCHER];
  }
  const { fetchOptions } = options;
  if (isObject(fetchOptions)) {
    for (const key of Object.keys(fetchOptions)) {
      if (!hasOwnProp(FAXIOS_INIT_KEYS, key)) init[key] = (fetchOptions as Record<string, unknown>)[key];
    }
  }
  init["signal"] = ctx.signal;
  init["method"] = ctx.method.toUpperCase();
  init["headers"] = toByteStringHeaderObject(ctx.headers.normalize(false));
  init["body"] = options.data;
  // Only a stream body needs `duplex`. Leaving it off otherwise also tells a custom
  // `env.fetch` (the forwardTo plugin) that the Request's body can be buffered and resent.
  if (isStreamBody(options.data)) init["duplex"] = "half";
  init["credentials"] = ctx.runtime.isCredentialsSupported
    ? normalizeCredentials(options.withCredentials ?? "same-origin")
    : undefined;
  return init;
};

// The init passed to fetch next to the Request. fetch builds its own Request from both, and
// undici converts the init into a plain dictionary first, so a member left out would pick up a
// polluted Object.prototype value (`method`, `headers`, `redirect`, ...). Every member the
// Request carries is set again from the Request itself, so nothing is re-encoded, and `headers`
// are the Request's already-validated ones. `body` is an own member, so fetch takes the
// Request's body instead of reading the caller's body a second time and never a polluted
// Object.prototype.body. Its value depends on the runtime: Deno treats an own `undefined` as
// missing and reads the prototype's, so it gets `null`, which keeps the Request's body there and
// in Node; Bun reads `null` as "send no body", so it gets `undefined`, which Bun does treat as
// an own member (nullKeepsBody tells them apart).
// `request.body` is never read here: in Bun and Deno that turns a string or bytes body into a
// stream, which is then sent without a Content-Length. Members a Request doesn't carry, such as
// undici's `dispatcher` or Next.js `next`, are copied as given.
const fetchInitFor = (
  runtime: FetchRuntime,
  sent: { init: Record<string, unknown>; Request: AnyConstructor; request: Request; }
): Record<string, unknown> => {
  const init: Record<string, unknown> = Object.create(null);
  const requestPrototype = sent.Request.prototype as object;
  for (const key of Object.keys(sent.init)) {
    if (key === "body" || key === "signal") continue;
    init[key] = hasOwnInPrototypeChain(requestPrototype, key) ? Reflect.get(sent.request, key) : sent.init[key];
  }
  init["body"] = runtime.nullKeepsBody ? null : undefined;
  init["signal"] = sent.init["signal"];
  return init;
};

// Web stream bodies must yield bytes, so a Node stream body is sent as a web stream whose string
// chunks (e.g. `Readable.from(["a"])`) are encoded.
async function* toByteChunks(source: AsyncIterable<unknown>) {
  for await (const chunk of source) yield typeof chunk === "string" ? textEncoder.encode(chunk) : chunk;
}
const toWebStream = (runtime: FetchRuntime, body: unknown): unknown =>
  (runtime.streamFrom && isStream(body)
    ? runtime.streamFrom(toByteChunks(body as AsyncIterable<unknown>))
    : body);

// A web stream or Node stream body: read once, as it is sent, and sent with `duplex`.
const isStreamBody = (body: unknown): boolean => isReadableStream(body) || isStream(body);

// Bodies counted as fetch reads them when maxBodyLength is set.
const isCountedWhileSent = (runtime: FetchRuntime, body: unknown): boolean =>
  isStreamBody(body) || (runtime.countsFormDataWhileSent && isSpecCompliantForm(body));

// Sizes come from the body itself, never an encoded copy: measuring must not allocate a buffer
// as large as the body it may reject.
const getBodyLength = (body: unknown): number | undefined => {
  if (body == null) {
    return 0;
  }

  if (isBlob(body)) {
    return (body as { size: number; }).size;
  }

  if (isArrayBufferView(body) || isArrayBuffer(body)) {
    return (body as ArrayBuffer | ArrayBufferView).byteLength;
  }

  if (isURLSearchParams(body)) {
    body = body + "";
  }

  if (isString(body)) {
    return utf8ByteLength(body as string);
  }
  return undefined;
};

// The bytes of a FormData body's field values and files, from their sizes, without reading the
// body. A lower bound: the multipart body adds boundaries and part headers. Undefined for any
// other body.
const getFormDataFieldsLength = (body: unknown): number | undefined => {
  if (!isSpecCompliantForm(body)) {
    return undefined;
  }
  let length = 0;
  for (const [ , value ] of body as Iterable<[string, unknown]>) {
    // A FormData value is a string or a File.
    const size = isString(value) ? undefined : getSafeProp(value, "size");
    length += typeof size === "number" ? size : utf8ByteLength(String(value));
  }
  return length;
};

const resolveBodyLength = (headers: FaxiosHeaders, body: unknown): number | undefined => {
  const length = toFiniteNumber(headers.getContentLength());

  return length == null ? getBodyLength(body) : length;
};

const normalizeCredentials = (wc: boolean | string): string => {
  if (isString(wc)) return wc as string;
  return wc === true ? "include" : "same-origin";
};

// HTTP basic authentication: extract auth from config or URL, set Authorization header,
// strip credentials from URL. Returns the (possibly updated) URL.
const applyAuthToRequest = (ctx: RequestContext, url: string): string => {
  let auth: undefined | { password: unknown; username: unknown; };
  const configAuth = readOwn(ctx.config, "auth");
  if (configAuth) {
    auth = {
      username: getSafeProp(configAuth, "username") || "",
      password: getSafeProp(configAuth, "password") || "",
    };
  }
  if (maybeWithAuthCredentials(url)) {
    const parsedURL = new URL(url, platform.origin);
    if (!auth && (parsedURL.username || parsedURL.password)) {
      auth = {
        username: decodeURIComponentSafe(parsedURL.username),
        password: decodeURIComponentSafe(parsedURL.password),
      };
    }
    if (parsedURL.username || parsedURL.password) {
      parsedURL.username = "";
      parsedURL.password = "";
      url = parsedURL.href;
    }
  }
  if (auth) {
    ctx.headers.delete("authorization");
    ctx.headers.set(
      "Authorization",
      "Basic " +
        _btoa(
          encodeUTF8(
            String(auth.username || "") + ":" + String(auth.password || "")
          )
        )
    );
  }
  return url;
};

// Pre-flight size checks: data: URL content-length and known-size body maxBodyLength. They run
// before any Request exists. Returns the body's length if it was measured, else undefined.
const checkPreflightLimits = (ctx: RequestContext, outbound: { data: unknown; url: string; }): number | undefined => {
  const { body: maxBodyLength, content: maxContentLength } = ctx.limits;
  // Enforce maxContentLength for data: URLs up-front so we never materialize
  // an oversized payload.
  if (
    maxContentLength !== undefined &&
    outbound.url.startsWith("data:") &&
    estimateDataURLDecodedBytes(outbound.url) > maxContentLength
  ) {
    throw contentTooLarge(ctx);
  }
  // Enforce maxBodyLength against known-size bodies before dispatch using
  // the body's actual size — never a caller-declared Content-Length.
  // A FormData body isn't measured, since that buffers it whole: its values alone over the limit
  // reject it here, and where it's streamed the byte counter covers the multipart framing too.
  if (maxBodyLength !== undefined && ctx.sendsBody) {
    const outboundLength = getBodyLength(outbound.data);
    const checkedLength = outboundLength ?? getFormDataFieldsLength(outbound.data);
    if (typeof checkedLength === "number" && isFinite(checkedLength)) {
      if (checkedLength > maxBodyLength) {
        throw bodyTooLarge(ctx);
      }
      return outboundLength;
    }
  }
  return undefined;
};

// Counts a request body stream as fetch reads it, which is after the Request exists, so the
// maxBodyLength error carries it.
const countUploadStream = (
  ctx: RequestContext,
  upload: { flush?: () => void; onProgress?: (bytes: number) => void; stream: unknown; }
): unknown => {
  const maxBodyLength = ctx.limits.body;
  return trackStream(
    upload.stream,
    DEFAULT_CHUNK_SIZE,
    (loadedBytes: number) => {
      if (maxBodyLength !== undefined && loadedBytes > maxBodyLength) {
        ctx.bodyError = bodyTooLarge(ctx);
        throw ctx.bodyError;
      }
      upload.onProgress && upload.onProgress(loadedBytes);
    },
    (err?: unknown) => {
      // A chunk trackStream rejected (not bytes) surfaces as the coded error, not ERR_NETWORK.
      if (err instanceof FaxiosError && !ctx.bodyError) {
        err.config = ctx.config;
        ctx.bodyError = err;
      }
      upload.flush && upload.flush();
    }
  );
};

// Set up request body streaming with upload progress and/or maxBodyLength enforcement.
// `contentLength` is the length the pre-flight check measured, if it did.
const buildUploadStream = (
  ctx: RequestContext,
  upload: { contentLength: number | undefined; data: unknown; url: string; }
): { data: unknown; encodedContentType: null | string; } => {
  const { onUploadProgress, runtime } = ctx;
  const { Request } = runtime;
  const { data } = upload;
  if (!ctx.sendsBody) return { data, encodedContentType: null };

  // A streamed body under maxBodyLength must be counted as fetch consumes
  // it; its size is never trusted from a caller-declared Content-Length.
  const mustEnforceStreamBody = ctx.limits.body !== undefined && isCountedWhileSent(runtime, data);

  if (!Request || !runtime.supportsRequestStream) {
    if (mustEnforceStreamBody && Request) {
      throw new FaxiosError(
        "Stream request bodies are not supported by the current fetch implementation",
        FaxiosError.ERR_NOT_SUPPORT,
        ctx.config
      );
    }
    // Without a Request, fetch gets the body as is, so a web stream body is counted directly.
    const counted = mustEnforceStreamBody && runtime.isReadableStreamSupported;
    return { data: counted ? countUploadStream(ctx, { stream: data }) : data, encodedContentType: null };
  }
  if (!onUploadProgress && !mustEnforceStreamBody) return { data, encodedContentType: null };

  const contentLength = upload.contentLength ?? resolveBodyLength(ctx.headers, data);
  // A declared length of 0 is only trusted to skip the wrap when we are
  // not enforcing a stream limit (which must not rely on that header).
  if (contentLength === 0 && !mustEnforceStreamBody) return { data, encodedContentType: null };

  const encoded = new Request(upload.url, {
    method: "POST",
    body: data,
    duplex: "half",
  }) as AnyRequest;
  // The Content-Type the Request derived when it encoded the body; fetch only sees the stream.
  const encodedContentType = encoded.headers.get("content-type");
  if (!encoded.body) return { data, encodedContentType };

  const [ onProgress, flush ] = onUploadProgress
    ? progressReporter(onUploadProgress as (data: FaxiosProgressEvent) => unknown, contentLength, false)
    : [];
  return { data: countUploadStream(ctx, { flush, onProgress, stream: encoded.body }), encodedContentType };
};

// Wrap the response body stream with download progress tracking and maxContentLength enforcement.
const buildDownloadStream = (
  ctx: RequestContext,
  received: { headers: FaxiosHeaders; release: (err?: unknown) => void; response: AnyResponse; }
): AnyResponse => {
  const { onDownloadProgress } = ctx;
  const { Response, supportsResponseStream } = ctx.runtime;
  const { headers, response } = received;
  const maxContentLength = ctx.limits.content;
  const needsWrapping = !!onDownloadProgress || maxContentLength !== undefined || ctx.streamsResponse;
  if (!Response || !supportsResponseStream || !response.body || !needsWrapping) {
    return response;
  }

  const options: Record<string, unknown> = {};
  [ "status", "statusText", "headers" ].forEach(prop => {
    options[prop] = response[prop];
  });

  // Content-Length is the encoded size; the stream yields decoded bytes, so
  // the total is unknown when the body is content-encoded.
  const contentEncoding = String(headers.get("content-encoding") ?? "").trim()
    .toLowerCase();
  const responseContentLength = contentEncoding && contentEncoding !== "identity"
    ? undefined
    : toFiniteNumber(headers.getContentLength());

  const [ onProgress, flush ] = onDownloadProgress
    ? progressReporter(onDownloadProgress as (data: FaxiosProgressEvent) => unknown, responseContentLength, true)
    : [];

  const onChunkProgress = (loadedBytes: number): void => {
    if (maxContentLength !== undefined && loadedBytes > maxContentLength) {
      throw contentTooLarge(ctx);
    }
    onProgress && onProgress(loadedBytes);
  };

  return new Response(
    trackStream(
      response.body,
      DEFAULT_CHUNK_SIZE,
      onChunkProgress,
      (err?: unknown) => {
        flush && flush();
        received.release(err);
      }
    ),
    options
  ) as AnyResponse;
};

// A size limit is set when it is a number above -1.
const limitOf = (value: unknown): number | undefined =>
  (typeof value === "number" && value > -1 ? value : undefined);

// One request through fetch; `input` holds the FetchAdapter arguments.
const sendRequest = async (
  runtime: FetchRuntime,
  input: { bodies: RequestBodies | undefined; body: unknown; config: InternalFaxiosRequestConfig; url: string; }
): Promise<FaxiosResponse> => {
  const { bodies, body, config } = input;
  const resolved = prepareRequest(config, input.url) as InternalFaxiosRequestConfig & {
    fetchOptions?: Record<string, unknown>;
    withCredentials?: boolean | string;
  };
  const method = resolved.method as string;
  const responseType = resolved.responseType ? String(resolved.responseType).toLowerCase() : "text";

  const envFetch = ownEnv(config, "fetch") as FetchFn | undefined;
  const _fetch: FetchFn = (envFetch || Reflect.get(globalThis, "fetch")) as FetchFn;

  // Owns the request's cleanup: aborting it on a failure aborts fetch, which releases the
  // connection and any body still being sent or received. `timeout` isn't armed here: the
  // request's signal carries the whole-request deadline (core/requestDeadline.ts).
  const requestController = new AbortController();
  const composedSignal = composeSignals([ resolved.signal, requestController.signal ]) as ComposedSignal;

  const unsubscribe = composedSignal.unsubscribe!.bind(composedSignal);
  // Set when a stream body keeps the request's signal and deadline in force past the response.
  let endStreamBody: (() => void) | undefined;

  const ctx: RequestContext = {
    bodyError: undefined,
    config,
    headers: resolved.headers,
    limits: { body: limitOf(resolved.maxBodyLength), content: limitOf(resolved.maxContentLength) },
    method,
    onDownloadProgress: resolved.onDownloadProgress,
    onUploadProgress: isBrowserRuntime ? undefined : resolved.onUploadProgress,
    request: undefined,
    runtime,
    sendsBody: method !== "get" && method !== "head",
    signal: composedSignal,
    stage: undefined,
    streamsResponse: runtime.supportsResponseStream && responseType === "stream",
    url: resolved.url,
  };
  // The response, or the status error, returned after the catch: aborting the request there
  // would error a stream body the status error hands to the caller.
  let settled: Promise<FaxiosResponse>;

  try {
    // Everything before the send builds the request, so an unparseable URL that the upload
    // stream or the credential check trips over still gets its code.
    ctx.stage = "build";
    rejectUsedStreamBody(body, config);

    const url = applyAuthToRequest(ctx, requireRequestURL(ctx.url, config));
    ctx.url = url;

    const contentLength = checkPreflightLimits(ctx, { data: body, url });
    const upload = buildUploadStream(ctx, { contentLength, data: body, url });
    const data = toWebStream(
      runtime,
      resolveBodyContentType(body, upload.data, ctx.headers, upload.encodedContentType, str => textEncoder.encode(str))
    );

    applyDefaultUserAgent(ctx.headers);

    const requestInit = buildRequestInit(ctx, {
      data,
      envFetch,
      fetchOptions: resolved.fetchOptions,
      withCredentials: resolved.withCredentials,
    });

    const { Request } = runtime;
    const request = Request ? new Request(url, requestInit) as Request : undefined;
    ctx.request = request;

    markStreamBodySent(body);
    ctx.stage = "send";
    let response = await (Request && request
      ? _fetch(request, fetchInitFor(runtime, { init: requestInit, Request, request }))
      : _fetch(url, requestInit));
    ctx.stage = undefined;

    const responseHeaders = FaxiosHeaders.from(response.headers);

    checkDeclaredContentLength(ctx, { headers: responseHeaders, status: response.status });

    // A stream body outlives this call, so its end, error or cancel releases the request, and
    // the request's signal and deadline govern it until then (core/requestDeadline.ts). A
    // buffered body is released below, or by the catch on failure.
    if (ctx.streamsResponse && response.body != null) endStreamBody = bodies?.open(reason => requestController.abort(reason));
    const releaseStreamBody = (bodyErr?: unknown): void => {
      if (!ctx.streamsResponse) return;
      if (bodyErr !== undefined) requestController.abort(bodyErr);
      unsubscribe();
      endStreamBody?.();
    };

    const counted = buildDownloadStream(ctx, { headers: responseHeaders, release: releaseStreamBody, response });
    // A response the wrapper couldn't wrap (no stream support, or no stream body) is measured
    // once read instead.
    const isCountedWhileRead = counted !== response;
    response = counted;

    const resolver = runtime.resolvers[findKey(runtime.resolvers, responseType) || "text"]!;
    ctx.stage = "body";
    const responseData = await resolver(response, config);
    ctx.stage = undefined;

    if (!isCountedWhileRead) checkMaterializedSize(ctx, responseData);

    // A stream body releases the request when it ends; a response without a body has nothing to wait for.
    if (!ctx.streamsResponse || response.body == null) unsubscribe();

    settled = settleByStatus({
      data: responseData,
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText,
      config,
      request: request ?? null,
    });
  }
  catch (err) {
    let error: unknown = err;
    try {
      handleFetchCaughtError(err, ctx);
    }
    catch (classified) {
      error = classified;
    }
    // Classify first: the abort below sets the composed signal's reason.
    requestController.abort(error);
    unsubscribe();
    endStreamBody?.();
    throw error;
  }
  return settled;
};

// One adapter per Request/Response pair. Weak keys let a per-request `env.Request` or
// `env.Response` be collected. `undefined` (use the global) and any non-function (disabled)
// get stand-in keys.
const GLOBAL_CTOR = {};
const NO_CTOR = {};
const adapters = new WeakMap<object, WeakMap<object, FetchAdapter>>();

const ctorKey = (ctor: unknown): object => {
  if (ctor === undefined) return GLOBAL_CTOR;
  return isFunction(ctor) ? (ctor as object) : NO_CTOR;
};

// `false` tells dispatchRequest that this runtime has no fetch.
// eslint-disable-next-line sonarjs/function-return-type
export const getFetch = (config?: { env?: Record<string, unknown>; }): false | FetchAdapter => {
  const fetch = ownEnv(config, "fetch");
  if (!isFunction(fetch || (globalThis as unknown as Record<string, unknown>)["fetch"])) {
    return false;
  }

  const Request = ownEnv(config, "Request");
  const Response = ownEnv(config, "Response");
  const requestKey = ctorKey(Request);
  const responseKey = ctorKey(Response);

  let byResponse = adapters.get(requestKey);
  if (!byResponse) {
    byResponse = new WeakMap();
    adapters.set(requestKey, byResponse);
  }
  let adapter = byResponse.get(responseKey);
  if (!adapter) {
    const runtime = probeRuntime({ Request, Response });
    adapter = (config, body, url, bodies) => sendRequest(runtime, { bodies, body, config, url });
    byResponse.set(responseKey, adapter);
  }
  return adapter;
};

getFetch();
