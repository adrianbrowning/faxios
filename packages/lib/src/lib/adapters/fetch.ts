import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import prepareRequest from "../core/prepareRequest.js";
import type { RequestBodies } from "../core/requestDeadline.js";
import resolveBodyContentType from "../core/resolveBodyContentType.js";
import { settle } from "../core/settle.js";
import { VERSION } from "../env/data.js";
import composeSignals from "../helpers/composeSignals.js";
import estimateDataURLDecodedBytes from "../helpers/estimateDataURLDecodedBytes.js";
import {
  asyncDecorator,
  progressEventDecorator,
  progressEventReducer
} from "../helpers/progressEventReducer.js";
import { toByteStringHeaderObject } from "../helpers/sanitizeHeaderValue.js";
import { trackStream } from "../helpers/trackStream.js";
import platform from "../platform.js";
import type {
  InternalFaxiosRequestConfig
} from "../types.js";
import utils from "../utils.js";
import { checkDeclaredContentLength, checkMaterializedSize, encodeStringWithoutContentType, handleFetchCaughtError, requireRequestURL } from "./fetch-helpers.js";
import type { ComposedSignal, FetchStage, PendingBodyErrorRef } from "./fetch-helpers.js";

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
type AnyReadableStream = {
  [key: string]: unknown;
  cancel: () => Promise<void>;
};
type AnyTextEncoder = { encode: (str: string) => Uint8Array; };

const DEFAULT_CHUNK_SIZE = 64 * 1024;

const { isFunction } = utils;

// Web stream bodies this adapter has sent. fetch can read a stream without leaving it locked,
// and there's no portable "disturbed" check, so a second send is caught here.
const sentStreamBodies = new WeakSet<object>();

// A stream body can be read once. Middleware that calls next() again after a try read it
// would send an empty body (Node stream) or get an uncoded TypeError from fetch (web stream).
const rejectUsedStreamBody = (data: unknown, config: InternalFaxiosRequestConfig): void => {
  const body = data as { bodyUsed?: unknown; destroyed?: unknown; locked?: unknown; readableDidRead?: unknown; readableEnded?: unknown; };
  const isWebStream = utils.isReadableStream!(data);
  if (
    (isWebStream && (body.locked === true || sentStreamBodies.has(body))) ||
    ((utils.isRequest!(data) || utils.isResponse!(data)) && body.bodyUsed === true) ||
    (utils.isStream(data) && (body.readableDidRead === true || body.readableEnded === true || body.destroyed === true))
  ) {
    throw new FaxiosError(
      "Request body stream was already used and can't be sent again; pass a new body for each try",
      FaxiosError.ERR_BAD_REQUEST,
      config
    );
  }
  if (isWebStream) sentStreamBodies.add(body);
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
  if (!utils.isString(value)) {
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
// `bodies`: the request's stream bodies, which core keeps under the request's signal.
type FetchAdapter = (config: InternalFaxiosRequestConfig, body: unknown, bodies?: RequestBodies) => Promise<unknown>;

// Own reads only: a polluted Object.prototype.fetch must never become the transport.
const readOwn = (obj: unknown, key: string): unknown =>
  typeof obj === "object" && obj !== null && utils.hasOwnProp(obj, key) ? Reflect.get(obj, key) : undefined;
const ownEnv = (config: unknown, key: keyof FetchEnv): unknown => readOwn(readOwn(config, "env"), key);

// Feature detection depends only on the Request and Response constructors, so one adapter
// serves every `env.fetch`. `env.fetch` is read for each request.
const factory = (env: Omit<FetchEnv, "fetch">): FetchAdapter => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const globalObject: Record<string, unknown> = utils.global ?? globalThis;
  const ReadableStream = globalObject["ReadableStream"] as
    | (AnyConstructor & { prototype: AnyReadableStream; })
    | undefined;
  const TextEncoder = globalObject["TextEncoder"] as
    | (new () => AnyTextEncoder)
    | undefined;

  // `undefined` falls back to the global constructor; `null` disables it.
  const Request = (env.Request === undefined ? globalObject["Request"] : env.Request) as AnyConstructor | undefined;
  const Response = (env.Response === undefined ? globalObject["Response"] : env.Response) as AnyConstructor | undefined;
  const isRequestSupported = isFunction(Request);
  const isResponseSupported = isFunction(Response);

  // Only members this runtime's Request exposes, so an engine that rejects members it doesn't
  // implement (Cloudflare Workers) is never sent one.
  const requestInitDefaults = Object.entries(REQUEST_INIT_DEFAULTS).filter(([ key ]) =>
    isRequestSupported && utils.hasOwnInPrototypeChain((Request as AnyConstructor).prototype, key));

  // Null prototype: WebIDL reads every RequestInit member with Get, which walks the prototype
  // chain, so a plain object literal would let a polluted Object.prototype.redirect, .integrity,
  // .mode or undici .dispatcher apply to every request. Every own enumerable key of fetchOptions
  // is copied, so runtime extensions (Next.js `next`, Workers `cf`, Bun `tls`) still pass through;
  // inherited keys never do. The caller sets signal, method, headers, body, duplex, credentials.
  const initFromFetchOptions = (fetchOptions: unknown, envFetch: FetchFn | undefined): Record<string, unknown> => {
    const init: Record<string, unknown> = Object.create(null);
    for (const [ key, value ] of requestInitDefaults) init[key] = value;
    // Node's global fetch reads `dispatcher` the same way; pin it to undici's own global one.
    if (!envFetch && utils.hasOwnProp(globalThis, UNDICI_GLOBAL_DISPATCHER)) {
      init["dispatcher"] = (globalThis as Record<PropertyKey, unknown>)[UNDICI_GLOBAL_DISPATCHER];
    }
    if (utils.isObject(fetchOptions)) {
      for (const key of Object.keys(fetchOptions)) {
        if (!utils.hasOwnProp(FAXIOS_INIT_KEYS, key)) init[key] = (fetchOptions as Record<string, unknown>)[key];
      }
    }
    return init;
  };

  const isReadableStreamSupported = isFunction(ReadableStream);

  const encodeText: (str: string) => Promise<Uint8Array> | Uint8Array =
    typeof TextEncoder === "function"
      ? (
        (encoder: AnyTextEncoder) => (str: string) =>
          encoder.encode(str)
      )(new TextEncoder())
      : async (str: string) =>
        new Uint8Array(
          await (
            new (Request as AnyConstructor)(str) as AnyRequest
          ).arrayBuffer()
        );

  // A Node stream body reaches fetch twice: once in `new Request(url, init)` and again in
  // `fetch(request, init)`. undici (Node 26.11+) starts reading an async iterable in both,
  // so the first chunk goes to the discarded copy. One web stream is read only once.
  // Web stream bodies must yield bytes, so string chunks (e.g. `Readable.from(["a"])`) are encoded.
  const from = (ReadableStream as undefined | { from?: (source: unknown) => unknown; })?.from;
  const streamFrom = typeof from === "function" ? from.bind(ReadableStream) : undefined;
  async function* toByteChunks(source: AsyncIterable<unknown>) {
    for await (const chunk of source) yield typeof chunk === "string" ? await encodeText(chunk) : chunk;
  }
  const toWebStream = (body: unknown): unknown =>
    (streamFrom && utils.isStream(body)
      ? streamFrom(toByteChunks(body as AsyncIterable<unknown>))
      : body);

  const supportsRequestStream =
    isRequestSupported &&
    isReadableStreamSupported &&
    test(() => {
      let duplexAccessed = false;

      const request = new (Request as AnyConstructor)(platform.origin, {
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

  // Outside browsers a FormData body under maxBodyLength is streamed and counted as fetch reads it;
  // browsers can't send a stream body (see buildUploadStream).
  const countsFormDataWhileSent = !isBrowserRuntime && supportsRequestStream;
  // Bodies counted as fetch reads them when maxBodyLength is set.
  const isCountedWhileSent = (body: unknown): boolean =>
    utils.isReadableStream!(body) || utils.isStream(body) || (countsFormDataWhileSent && utils.isSpecCompliantForm(body));

  const supportsResponseStream =
    isResponseSupported &&
    isReadableStreamSupported &&
    test(() =>
      utils.isReadableStream!(
        (new (Response as AnyConstructor)("") as AnyResponse).body
      )
    );

  const resolvers: Record<
    string,
    ((res: AnyResponse, config?: unknown) => unknown) | false
  > = {
    stream: supportsResponseStream && ((res: AnyResponse) => res.body),
  };

  [ "text", "arrayBuffer", "blob", "formData", "stream" ].forEach(type => {
    !resolvers[type] &&
      (resolvers[type] = (res: AnyResponse, config?: unknown) => {
        const method = (res as Record<string, unknown>)[type];

        if (method) {
          return (method as (this: AnyResponse) => unknown).call(res);
        }

        throw new FaxiosError(
          `Response type '${type}' is not supported`,
          FaxiosError.ERR_NOT_SUPPORT,
          config as InternalFaxiosRequestConfig
        );
      });
  });

  const getBodyLength = async (body: unknown): Promise<number | undefined> => {
    if (body == null) {
      return 0;
    }

    if (utils.isBlob(body)) {
      return (body as { size: number; }).size;
    }

    if (utils.isArrayBufferView(body) || utils.isArrayBuffer(body)) {
      return (body as ArrayBuffer | ArrayBufferView).byteLength;
    }

    if (utils.isURLSearchParams(body)) {
      body = body + "";
    }

    if (utils.isString(body)) {
      return (await encodeText(body as string)).byteLength;
    }
    return undefined;
  };

  // The bytes of a FormData body's field values and files, from their sizes, without reading the
  // body. A lower bound: the multipart body adds boundaries and part headers. Undefined for any
  // other body.
  const getFormDataFieldsLength = async (body: unknown): Promise<number | undefined> => {
    if (!utils.isSpecCompliantForm(body)) {
      return undefined;
    }
    let length = 0;
    for (const [ , value ] of body as Iterable<[string, unknown]>) {
      // A FormData value is a string or a File.
      const size = utils.isString(value) ? undefined : utils.getSafeProp(value, "size");
      // eslint-disable-next-line no-await-in-loop
      length += typeof size === "number" ? size : (await encodeText(String(value))).byteLength;
    }
    return length;
  };

  const resolveBodyLength = async (
    headers: FaxiosHeaders,
    body: unknown
  ): Promise<number | undefined> => {
    const length = utils.toFiniteNumber(headers.getContentLength());

    return length == null ? getBodyLength(body) : length;
  };

  const normalizeCredentials = (wc: boolean | string): string => {
    if (utils.isString(wc)) return wc as string;
    return wc === true ? "include" : "same-origin";
  };

  // HTTP basic authentication: extract auth from config or URL, set Authorization header,
  // strip credentials from URL. Returns the (possibly updated) URL.
  const applyAuthToRequest = (
    url: string,
    headers: FaxiosHeaders,
    own: (key: string) => unknown
  ): string => {
    let auth: undefined | { password: unknown; username: unknown; };
    const configAuth = own("auth");
    if (configAuth) {
      auth = {
        username: utils.getSafeProp(configAuth, "username") || "",
        password: utils.getSafeProp(configAuth, "password") || "",
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
      headers.delete("authorization");
      headers.set(
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

  // Pre-flight size checks: data: URL content-length and known-size body maxBodyLength.
  // Returns requestContentLength if computed, else undefined.
  const checkPreflightLimits = async (
    url: string,
    data: unknown,
    method: string,
    hasMaxContentLength: boolean,
    maxContentLength: number,
    hasMaxBodyLength: boolean,
    maxBodyLength: number,
    config: InternalFaxiosRequestConfig,
    request: unknown
  ): Promise<number | undefined> => {
    // Enforce maxContentLength for data: URLs up-front so we never materialize
    // an oversized payload. The HTTP adapter applies the same check.
    if (
      hasMaxContentLength &&
      typeof url === "string" &&
      url.startsWith("data:")
    ) {
      const estimated = estimateDataURLDecodedBytes(url);
      if (estimated > maxContentLength) {
        throw new FaxiosError(
          "maxContentLength size of " + maxContentLength + " exceeded",
          FaxiosError.ERR_BAD_RESPONSE,
          config,
          request
        );
      }
    }
    // Enforce maxBodyLength against known-size bodies before dispatch using
    // the body's actual size — never a caller-declared Content-Length.
    // A FormData body isn't measured, since that buffers it whole: its values alone over the limit
    // reject it here, and where it's streamed the byte counter covers the multipart framing too.
    if (hasMaxBodyLength && method !== "get" && method !== "head") {
      const outboundLength = await getBodyLength(data);
      const checkedLength = outboundLength ?? await getFormDataFieldsLength(data);
      if (typeof checkedLength === "number" && isFinite(checkedLength)) {
        if (checkedLength > maxBodyLength) {
          throw new FaxiosError(
            "Request body larger than maxBodyLength limit",
            FaxiosError.ERR_BAD_REQUEST,
            config,
            request
          );
        }
        return outboundLength;
      }
    }
    return undefined;
  };

  // Wrap a Request body with upload progress tracking and optional maxBodyLength enforcement.
  const applyUploadProgress = (
    _request: AnyRequest,
    data: unknown,
    requestContentLength: number | undefined,
    onUploadProgress: unknown,
    _trackStream: (stream: unknown, onProgress?: (bytes: number) => void, flush?: () => void) => unknown
  ): unknown => {
    if (_request.body) {
      const [ onProgress, flush ] = onUploadProgress
        ? progressEventDecorator(
          requestContentLength,
          progressEventReducer(
            asyncDecorator(
              onUploadProgress as (...args: Array<unknown>) => unknown
            ),
            false
          )
        )
        : [];
      return _trackStream(_request.body, onProgress, flush);
    }
    return data;
  };

  // Set up request body streaming with upload progress and/or maxBodyLength enforcement.
  const buildUploadStream = async (
    data: unknown,
    url: string,
    method: string,
    headers: FaxiosHeaders,
    onUploadProgress: unknown,
    mustEnforceStreamBody: boolean,
    requestContentLength: number | undefined,
    hasMaxBodyLength: boolean,
    maxBodyLength: number,
    config: InternalFaxiosRequestConfig,
    request: unknown,
    pendingBodyErrorRef: PendingBodyErrorRef
  ): Promise<{ data: unknown; encodedContentType: null | string; requestContentLength: number | undefined; }> => {
    // Browsers can't be given a stream body for upload progress: Chromium sends one only over
    // HTTP/2 or later and WebKit not at all, so the upload would fail. onUploadProgress isn't
    // called there (#209).
    const uploadProgress = isBrowserRuntime ? undefined : onUploadProgress;
    const _makeBodyLengthError = () =>
      new FaxiosError(
        "Request body larger than maxBodyLength limit",
        FaxiosError.ERR_BAD_REQUEST,
        config,
        request
      );

    const _trackStream = (
      stream: unknown,
      onProgress?: (bytes: number) => void,
      flush?: () => void
    ) =>
      trackStream(
        stream,
        DEFAULT_CHUNK_SIZE,
        (loadedBytes: number) => {
          if (hasMaxBodyLength && loadedBytes > maxBodyLength) {
            pendingBodyErrorRef.value = _makeBodyLengthError();
            throw pendingBodyErrorRef.value;
          }
          onProgress && onProgress(loadedBytes);
        },
        (err?: unknown) => {
          // A chunk trackStream rejected (not bytes) surfaces as the coded error, not ERR_NETWORK.
          if (err instanceof FaxiosError && !pendingBodyErrorRef.value) {
            err.config = config;
            pendingBodyErrorRef.value = err;
          }
          flush && flush();
        }
      );

    // The Content-Type the Request derived when it encoded the body; fetch only sees the stream.
    let encodedContentType: null | string = null;
    if (
      supportsRequestStream &&
      method !== "get" &&
      method !== "head" &&
      (uploadProgress || mustEnforceStreamBody)
    ) {
      requestContentLength =
        requestContentLength == null
          ? await resolveBodyLength(headers, data)
          : requestContentLength;

      // A declared length of 0 is only trusted to skip the wrap when we are
      // not enforcing a stream limit (which must not rely on that header).
      if (requestContentLength !== 0 || mustEnforceStreamBody) {
        const _request = new (Request as AnyConstructor)(url, {
          method: "POST",
          body: data,
          duplex: "half",
        }) as AnyRequest;
        encodedContentType = _request.headers.get("content-type");
        data = applyUploadProgress(_request, data, requestContentLength, uploadProgress, _trackStream);
      }
    }
    else if (
      mustEnforceStreamBody &&
      !isRequestSupported &&
      isReadableStreamSupported &&
      method !== "get" &&
      method !== "head"
    ) {
      data = _trackStream(data);
    }
    else if (
      mustEnforceStreamBody &&
      isRequestSupported &&
      !supportsRequestStream &&
      method !== "get" &&
      method !== "head"
    ) {
      throw new FaxiosError(
        "Stream request bodies are not supported by the current fetch implementation",
        FaxiosError.ERR_NOT_SUPPORT,
        config,
        request
      );
    }

    return { data, encodedContentType, requestContentLength };
  };

  // Wrap the response body stream with download progress tracking and maxContentLength enforcement.
  const buildDownloadStream = (
    response: AnyResponse,
    responseHeaders: FaxiosHeaders,
    onDownloadProgress: unknown,
    hasMaxContentLength: boolean,
    maxContentLength: number,
    isStreamResponse: boolean,
    release: (err?: unknown) => void,
    config: InternalFaxiosRequestConfig,
    request: unknown
  ): AnyResponse => {
    const needsWrapping = !!onDownloadProgress || hasMaxContentLength || isStreamResponse;
    if (!supportsResponseStream || !response.body || !needsWrapping) {
      return response;
    }

    const options: Record<string, unknown> = {};
    [ "status", "statusText", "headers" ].forEach(prop => {
      options[prop] = response[prop];
    });

    // Content-Length is the encoded size; the stream yields decoded bytes, so
    // the total is unknown when the body is content-encoded.
    const contentEncoding = String(responseHeaders.get("content-encoding") ?? "").trim()
      .toLowerCase();
    const responseContentLength = contentEncoding && contentEncoding !== "identity"
      ? undefined
      : utils.toFiniteNumber(
        (responseHeaders.getContentLength as () => unknown)()
      );

    const [ onProgress, flush ] = onDownloadProgress
      ? progressEventDecorator(
        responseContentLength,
        progressEventReducer(
          asyncDecorator(
            onDownloadProgress as (...args: Array<unknown>) => unknown
          ),
          true
        )
      )
      : [];

    let bytesRead = 0;
    const onChunkProgress = (loadedBytes: number): void => {
      if (hasMaxContentLength) {
        bytesRead = loadedBytes;
        if (bytesRead > maxContentLength) {
          throw new FaxiosError(
            "maxContentLength size of " + maxContentLength + " exceeded",
            FaxiosError.ERR_BAD_RESPONSE,
            config,
            request
          );
        }
      }
      onProgress && onProgress(loadedBytes);
    };

    return new (Response as AnyConstructor)(
      trackStream(
        response.body,
        DEFAULT_CHUNK_SIZE,
        onChunkProgress,
        (err?: unknown) => {
          flush && flush();
          release(err);
        }
      ),
      options
    ) as AnyResponse;
  };

  // A stream body releases the request when it ends; a response without a body has nothing to wait for.
  const unsubscribeOnComplete = (isStreamResponse: boolean, response: AnyResponse, unsubscribe: () => void) => {
    if (!isStreamResponse || response.body == null) unsubscribe();
  };

  return async (config: InternalFaxiosRequestConfig, body: unknown, bodies?: RequestBodies) => {
    const _resolved = prepareRequest(config) as InternalFaxiosRequestConfig & {
      fetchOptions?: Record<string, unknown>;
      withCredentials?: boolean | string;
    };
    let {
      url,
      method,
      signal,
      onDownloadProgress,
      onUploadProgress,
      responseType,
      fetchOptions,
      maxContentLength,
      maxBodyLength,
    } = _resolved;
    // The body transformRequest produced; `config.data` keeps the caller's value for errors.
    let data = body;
    let headers = _resolved.headers;
    let withCredentials: boolean | string =
      _resolved.withCredentials ?? "same-origin";

    const hasMaxContentLength =
      utils.isNumber(maxContentLength) && maxContentLength! > -1;
    const hasMaxBodyLength =
      utils.isNumber(maxBodyLength) && maxBodyLength! > -1;
    const own = (key: string): unknown =>
      utils.hasOwnProp(config, key)
        ? (config as unknown as Record<string, unknown>)[key]
        : undefined;

    const envFetch = ownEnv(config, "fetch") as FetchFn | undefined;
    const _fetch: FetchFn = (envFetch || (globalThis as unknown as Record<string, unknown>)["fetch"]) as FetchFn;

    responseType = (
      responseType ? (responseType + "").toLowerCase() : "text"
    ) as typeof responseType;

    // Owns the request's cleanup: aborting it on a failure aborts fetch, which releases the
    // connection and any body still being sent or received. `timeout` isn't armed here: the
    // request's signal carries the whole-request deadline (core/requestDeadline.ts).
    const requestController = new AbortController();
    const composedSignal = composeSignals([ signal, requestController.signal ]) as ComposedSignal;

    const unsubscribe = composedSignal.unsubscribe!.bind(composedSignal);
    // Set when a stream body keeps the request's signal and deadline in force past the response.
    let endStreamBody: (() => void) | undefined;

    let request: null | Request = null;
    const pendingBodyErrorRef: PendingBodyErrorRef = { value: null };
    // Which step a code-less TypeError came from, so it can get a code.
    let stage: FetchStage | undefined;

    try {
      // Everything before the send builds the request, so an unparseable URL that the upload
      // stream or the credential check trips over still gets its code.
      stage = "build";
      rejectUsedStreamBody(data, config);

      url = applyAuthToRequest(requireRequestURL(url, config), headers, own);

      const preflightContentLength = await checkPreflightLimits(
        url,
        data,
        method!,
        hasMaxContentLength,
        maxContentLength!,
        hasMaxBodyLength,
        maxBodyLength!,
        config,
        request
      );

      // A streamed body under maxBodyLength must be counted as fetch consumes
      // it; its size is never trusted from a caller-declared Content-Length.
      const mustEnforceStreamBody = hasMaxBodyLength && isCountedWhileSent(data);

      const preparedBody = data;
      let encodedContentType: null | string;
      ({ data, encodedContentType } = await buildUploadStream(
        data,
        url,
        method!,
        headers,
        onUploadProgress,
        mustEnforceStreamBody,
        preflightContentLength,
        hasMaxBodyLength,
        maxBodyLength!,
        config,
        request,
        pendingBodyErrorRef
      ));

      withCredentials = normalizeCredentials(withCredentials);

      // Cloudflare Workers throws when credentials are defined
      // see https://github.com/cloudflare/workerd/issues/902
      const isCredentialsSupported =
        isRequestSupported &&
        Request != null &&
        "credentials" in (Request.prototype as object);

      resolveBodyContentType(preparedBody, headers, encodedContentType);

      applyDefaultUserAgent(headers);

      const serializedHeaders = toByteStringHeaderObject(headers.normalize(false));

      data = toWebStream(await encodeStringWithoutContentType(data, headers, encodeText));

      const resolvedOptions = initFromFetchOptions(fetchOptions, envFetch);
      resolvedOptions["signal"] = composedSignal;
      resolvedOptions["method"] = (method as string).toUpperCase();
      resolvedOptions["headers"] = serializedHeaders;
      resolvedOptions["body"] = data;
      resolvedOptions["duplex"] = "half";
      resolvedOptions["credentials"] = isCredentialsSupported ? withCredentials : undefined;

      request = isRequestSupported
        ? new (Request as AnyConstructor)(url, resolvedOptions) as Request
        : null;

      // Pass resolvedOptions as the fetch init even when a Request object is supplied, so the
      // same null-prototype members apply to both calls.
      stage = "send";
      let response = await (isRequestSupported
        ? _fetch(request, resolvedOptions)
        : _fetch(url, resolvedOptions));
      stage = undefined;

      const responseHeaders = FaxiosHeaders.from(response.headers);

      checkDeclaredContentLength(responseHeaders, method!, response.status, hasMaxContentLength, maxContentLength!, config, request);

      const isStreamResponse = supportsResponseStream && responseType === "stream";

      // A stream body outlives this call, so its end, error or cancel releases the request, and
      // the request's signal and deadline govern it until then (core/requestDeadline.ts). A
      // buffered body is released below, or by the catch on failure.
      if (isStreamResponse && response.body != null) endStreamBody = bodies?.open(reason => requestController.abort(reason));
      const releaseStreamBody = (bodyErr?: unknown): void => {
        if (!isStreamResponse) return;
        if (bodyErr !== undefined) requestController.abort(bodyErr);
        unsubscribe();
        endStreamBody?.();
      };

      response = buildDownloadStream(
        response,
        responseHeaders,
        onDownloadProgress,
        hasMaxContentLength,
        maxContentLength!,
        isStreamResponse,
        releaseStreamBody,
        config,
        request
      );

      responseType = responseType || "text";

      const resolverKey = utils.findKey(resolvers, responseType) || "text";
      const resolver = resolvers[resolverKey];
      stage = "body";
      const responseData = await (resolver && resolver(response, config));
      stage = undefined;

      checkMaterializedSize(
        responseData,
        hasMaxContentLength,
        maxContentLength!,
        isStreamResponse,
        supportsResponseStream,
        config,
        request
      );

      unsubscribeOnComplete(isStreamResponse, response, unsubscribe);

      return await new Promise((resolve, reject) => {
        settle(resolve, reject, {
          data: responseData,
          headers: responseHeaders,
          status: response.status,
          statusText: response.statusText,
          config,
          request,
        });
      });
    }
    catch (err) {
      let error: unknown = err;
      try {
        handleFetchCaughtError(err, composedSignal, pendingBodyErrorRef, config, request, stage, url);
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
  };
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
    adapter = factory({ Request, Response });
    byResponse.set(responseKey, adapter);
  }
  return adapter;
};

getFetch();
