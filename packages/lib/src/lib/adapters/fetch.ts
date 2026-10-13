import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import prepareRequest from "../core/prepareRequest.js";
import { holdDeadline } from "../core/requestDeadline.js";
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
import { findKey, getSafeProp, hasOwnInPrototypeChain, hasOwnProp, isArrayBuffer, isArrayBufferView, isBlob, isFunction, isNumber, isObject, isReadableStream, isRequest, isResponse, isSpecCompliantForm, isStream, isString, isURLSearchParams, toFiniteNumber } from "../utils.js";
import { bodyTooLarge, checkDeclaredContentLength, checkMaterializedSize, contentTooLarge, handleFetchCaughtError } from "./fetch-helpers.js";
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
type AnyReadableStream = {
  [key: string]: unknown;
  cancel: () => Promise<void>;
};
type AnyTextEncoder = { encode: (str: string) => Uint8Array; };

const DEFAULT_CHUNK_SIZE = 64 * 1024;

// A known-size request body: `checked` is compared to maxBodyLength, `length` is its size.
type BodySize = { checked: number; length: number | undefined; };
type ProgressHandlers = [(loaded: number) => void, () => void];

// `maxBodyLength` / `maxContentLength` as a byte limit; a negative or non-number value sets none.
const sizeLimit = (value: unknown): number | undefined =>
  (isNumber(value) && (value as number) > -1 ? value as number : undefined);

const hasBody = (ctx: FetchContext): boolean => ctx.method !== "get" && ctx.method !== "head";

// Web stream bodies this adapter has sent. fetch can read a stream without leaving it locked,
// and there's no portable "disturbed" check, so a second send is caught here.
const sentStreamBodies = new WeakSet<object>();

// A stream body can be read once. Middleware that calls next() again after a try read it
// would send an empty body (Node stream) or get an uncoded TypeError from fetch (web stream).
const rejectUsedStreamBody = (data: unknown, config: InternalFaxiosRequestConfig): void => {
  const body = data as { bodyUsed?: unknown; destroyed?: unknown; locked?: unknown; readableDidRead?: unknown; readableEnded?: unknown; };
  const isWebStream = isReadableStream(data);
  if (
    (isWebStream && (body.locked === true || sentStreamBodies.has(body))) ||
    ((isRequest(data) || isResponse(data)) && body.bodyUsed === true) ||
    (isStream(data) && (body.readableDidRead === true || body.readableEnded === true || body.destroyed === true))
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

const test = (fn: () => unknown): boolean => {
  try {
    return !!fn();
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

type FetchAdapter = (config: InternalFaxiosRequestConfig) => Promise<unknown>;

// Own reads only: a polluted Object.prototype.fetch must never become the transport.
const readOwn = (obj: unknown, key: string): unknown =>
  typeof obj === "object" && obj !== null && hasOwnProp(obj, key) ? Reflect.get(obj, key) : undefined;
const ownEnv = (config: unknown, key: keyof FetchEnv): unknown => readOwn(readOwn(config, "env"), key);

// Feature detection depends only on the Request and Response constructors, so one adapter
// serves every `env.fetch`. `env.fetch` is read for each request.
const factory = (env: Omit<FetchEnv, "fetch">): FetchAdapter => {
  const globalObject: Record<string, unknown> = globalThis;
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
    isRequestSupported && hasOwnInPrototypeChain((Request as AnyConstructor).prototype, key));

  // Null prototype: WebIDL reads every RequestInit member with Get, which walks the prototype
  // chain, so a plain object literal would let a polluted Object.prototype.redirect, .integrity,
  // .mode or undici .dispatcher apply to every request. Every own enumerable key of fetchOptions
  // is copied, so runtime extensions (Next.js `next`, Workers `cf`, Bun `tls`) still pass through;
  // inherited keys never do. The caller sets signal, method, headers, body, duplex, credentials.
  const initFromFetchOptions = (fetchOptions: unknown, envFetch: FetchFn | undefined): Record<string, unknown> => {
    const init: Record<string, unknown> = Object.create(null);
    for (const [ key, value ] of requestInitDefaults) init[key] = value;
    // Node's global fetch reads `dispatcher` the same way; pin it to undici's own global one.
    if (!envFetch && hasOwnProp(globalThis, UNDICI_GLOBAL_DISPATCHER)) {
      init["dispatcher"] = (globalThis as Record<PropertyKey, unknown>)[UNDICI_GLOBAL_DISPATCHER];
    }
    if (isObject(fetchOptions)) {
      for (const key of Object.keys(fetchOptions)) {
        if (!hasOwnProp(FAXIOS_INIT_KEYS, key)) init[key] = (fetchOptions as Record<string, unknown>)[key];
      }
    }
    return init;
  };

  const isReadableStreamSupported = isFunction(ReadableStream);

  // Cloudflare Workers throws when credentials are defined
  // see https://github.com/cloudflare/workerd/issues/902
  const isCredentialsSupported =
    isRequestSupported &&
    Request != null &&
    "credentials" in (Request.prototype as object);

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
    (streamFrom && isStream(body)
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
    isReadableStream(body) || isStream(body) || (countsFormDataWhileSent && isSpecCompliantForm(body));

  const supportsResponseStream =
    isResponseSupported &&
    isReadableStreamSupported &&
    test(() =>
      isReadableStream(
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
      return (await encodeText(body as string)).byteLength;
    }
    return undefined;
  };

  // The bytes of a FormData body's field values and files, from their sizes, without reading the
  // body. A lower bound: the multipart body adds boundaries and part headers. Undefined for any
  // other body.
  const getFormDataFieldsLength = async (body: unknown): Promise<number | undefined> => {
    if (!isSpecCompliantForm(body)) {
      return undefined;
    }
    let length = 0;
    for (const [ , value ] of body as Iterable<[string, unknown]>) {
      // A FormData value is a string or a File.
      const size = isString(value) ? undefined : getSafeProp(value, "size");
      // eslint-disable-next-line no-await-in-loop
      length += typeof size === "number" ? size : (await encodeText(String(value))).byteLength;
    }
    return length;
  };

  const resolveBodyLength = async (
    headers: FaxiosHeaders,
    body: unknown
  ): Promise<number | undefined> => {
    const length = toFiniteNumber(headers.getContentLength());

    return length == null ? getBodyLength(body) : length;
  };

  const normalizeCredentials = (wc: boolean | string): string => {
    if (isString(wc)) return wc as string;
    return wc ? "include" : "omit";
  };

  // HTTP basic authentication: extract auth from config or URL, set Authorization header,
  // strip credentials from URL. Returns the (possibly updated) URL.
  const applyAuthToRequest = (ctx: FetchContext): string => {
    let { url } = ctx;
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

  // A known-size body measured against maxBodyLength, before it's sent: `length` is its size and
  // `checked` what the limit is compared to. A FormData body isn't measured, since that buffers it
  // whole: its values alone are checked here, and where it's streamed the byte counter covers the
  // multipart framing too. Never a caller-declared Content-Length.
  const measureBody = async (ctx: FetchContext, data: unknown): Promise<BodySize | undefined> => {
    if (ctx.limits.body === undefined || !hasBody(ctx)) return undefined;
    const length = await getBodyLength(data);
    const checked = length ?? await getFormDataFieldsLength(data);
    return typeof checked === "number" && isFinite(checked) ? { checked, length } : undefined;
  };

  // The size limit a request breaks before it's sent, if any: a data: URL over maxContentLength
  // (checked up-front so an oversized payload is never materialized) or a known-size body over
  // maxBodyLength. The error is raised once the Request exists, so it carries it.
  const preflightLimitError = (ctx: FetchContext, bodySize: BodySize | undefined): ((ctx: FetchContext) => FaxiosError) | undefined => {
    if (
      ctx.limits.content !== undefined &&
      ctx.url.startsWith("data:") &&
      estimateDataURLDecodedBytes(ctx.url) > ctx.limits.content
    ) {
      return contentTooLarge;
    }
    if (ctx.limits.body !== undefined && bodySize && bodySize.checked > ctx.limits.body) {
      return bodyTooLarge;
    }
    return undefined;
  };

  // Counts a request body's bytes as fetch reads it, against maxBodyLength, and reports upload progress.
  const uploadTracker = (ctx: FetchContext) => (stream: unknown, [ onProgress, flush ]: [] | ProgressHandlers = []): unknown =>
    trackStream(
      stream,
      DEFAULT_CHUNK_SIZE,
      (loadedBytes: number) => {
        if (ctx.limits.body !== undefined && loadedBytes > ctx.limits.body) {
          ctx.pendingBodyError = bodyTooLarge(ctx);
          throw ctx.pendingBodyError;
        }
        onProgress && onProgress(loadedBytes);
      },
      (err?: unknown) => {
        // A chunk trackStream rejected (not bytes) surfaces as the coded error, not ERR_NETWORK.
        if (err instanceof FaxiosError && !ctx.pendingBodyError) {
          err.config = ctx.config;
          ctx.pendingBodyError = err;
        }
        flush && flush();
      }
    );

  // Browsers can't be given a stream body for upload progress: Chromium sends one only over
  // HTTP/2 or later and WebKit not at all, so the upload would fail. onUploadProgress isn't
  // called there (#209).
  const uploadListener = (ctx: FetchContext): unknown => (isBrowserRuntime ? undefined : ctx.progress.upload);

  // The body as the stream a Request encodes it to, counted and reported as fetch reads it.
  const trackRequestBody = (
    ctx: FetchContext,
    body: { data: unknown; length: number | undefined; }
  ): { data: unknown; encodedContentType: null | string; } => {
    const _request = new (Request as AnyConstructor)(ctx.url, {
      method: "POST",
      body: body.data,
      duplex: "half",
    }) as AnyRequest;
    // The Content-Type the Request derived when it encoded the body; fetch only sees the stream.
    const encodedContentType = _request.headers.get("content-type");
    if (!_request.body) return { data: body.data, encodedContentType };
    const listener = uploadListener(ctx);
    const progress = listener
      ? progressEventDecorator(
        body.length,
        progressEventReducer(asyncDecorator(listener as (...args: Array<unknown>) => unknown), false)
      )
      : undefined;
    return { data: uploadTracker(ctx)(_request.body, progress), encodedContentType };
  };

  // Set up request body streaming with upload progress and/or maxBodyLength enforcement.
  const buildUploadStream = async (
    ctx: FetchContext,
    body: { data: unknown; length: number | undefined; }
  ): Promise<{ data: unknown; encodedContentType: null | string; }> => {
    const { data } = body;
    const unchanged = { data, encodedContentType: null };
    if (!hasBody(ctx)) return unchanged;
    // A streamed body under maxBodyLength must be counted as fetch consumes it; its size is
    // never trusted from a caller-declared Content-Length.
    const mustEnforceStreamBody = ctx.limits.body !== undefined && isCountedWhileSent(data);

    if (supportsRequestStream && (uploadListener(ctx) || mustEnforceStreamBody)) {
      const length = body.length ?? await resolveBodyLength(ctx.headers, data);
      // A declared length of 0 is only trusted to skip the wrap when we are
      // not enforcing a stream limit (which must not rely on that header).
      if (length === 0 && !mustEnforceStreamBody) return unchanged;
      return trackRequestBody(ctx, { data, length });
    }
    if (mustEnforceStreamBody && !isRequestSupported && isReadableStreamSupported) {
      return { data: uploadTracker(ctx)(data), encodedContentType: null };
    }
    if (mustEnforceStreamBody && isRequestSupported && !supportsRequestStream) {
      throw new FaxiosError(
        "Stream request bodies are not supported by the current fetch implementation",
        FaxiosError.ERR_NOT_SUPPORT,
        ctx.config,
        ctx.request
      );
    }
    return unchanged;
  };

  // Wrap the response body stream with download progress tracking and maxContentLength enforcement.
  const buildDownloadStream = (
    ctx: FetchContext,
    received: { headers: FaxiosHeaders; response: AnyResponse; }
  ): AnyResponse => {
    const { headers: responseHeaders, response } = received;
    const onDownloadProgress = ctx.progress.download;
    const needsWrapping = !!onDownloadProgress || ctx.limits.content !== undefined || ctx.isStreamResponse;
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
      : toFiniteNumber(
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

    const onChunkProgress = (loadedBytes: number): void => {
      if (ctx.limits.content !== undefined && loadedBytes > ctx.limits.content) {
        throw contentTooLarge(ctx);
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
          ctx.releaseStreamBody(err);
        }
      ),
      options
    ) as AnyResponse;
  };

  // fetch sends a string body as `text/plain;charset=UTF-8` when there's no Content-Type. A
  // Content-Type of `null` or `false` keeps the header off, so that string goes out as its bytes.
  const encodeStringWithoutContentType = (data: unknown, headers: FaxiosHeaders): Promise<unknown> | unknown => {
    if (typeof data !== "string") return data;
    const key = findKey(headers, "content-type");
    const contentType = key ? headers[key] : undefined;
    return contentType === null || contentType === false ? encodeText(data) : data;
  };

  return async (config: InternalFaxiosRequestConfig) => {
    const _resolved = prepareRequest(config) as InternalFaxiosRequestConfig & {
      fetchOptions?: Record<string, unknown>;
      withCredentials?: boolean | string;
    };
    let {
      url,
      method,
      data,
      signal,
      onDownloadProgress,
      onUploadProgress,
      responseType,
      fetchOptions,
      maxContentLength,
      maxBodyLength,
    } = _resolved;
    const headers = _resolved.headers;
    let withCredentials: boolean | string =
      _resolved.withCredentials ?? "same-origin";

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
    // Set when a stream body keeps the request's deadline armed past the response.
    let releaseDeadline: (() => void) | undefined;
    const isStreamResponse = supportsResponseStream && responseType === "stream";

    const ctx: FetchContext = {
      config,
      headers,
      isStreamResponse,
      limits: { body: sizeLimit(maxBodyLength), content: sizeLimit(maxContentLength) },
      method: method!,
      pendingBodyError: null,
      progress: { download: onDownloadProgress, upload: onUploadProgress },
      // A stream body outlives this call, so its end, error or cancel releases the request, and
      // the deadline keeps running until then. A buffered body is released below, or by the
      // catch on failure.
      releaseStreamBody: (bodyErr?: unknown): void => {
        if (!isStreamResponse) return;
        if (bodyErr !== undefined) requestController.abort(bodyErr);
        unsubscribe();
        releaseDeadline?.();
      },
      request: null,
      signal: composedSignal,
      stage: undefined,
      url: url!,
    };

    try {
      rejectUsedStreamBody(data, config);

      ctx.url = applyAuthToRequest(ctx);

      const bodySize = await measureBody(ctx, data);
      const tooLarge = preflightLimitError(ctx, bodySize);

      const preparedBody = data;
      let encodedContentType: null | string = null;
      // A request rejected before it's sent doesn't get its body prepared for upload.
      if (!tooLarge) ({ data, encodedContentType } = await buildUploadStream(ctx, { data, length: bodySize?.length }));

      withCredentials = normalizeCredentials(withCredentials);

      resolveBodyContentType(preparedBody, headers, encodedContentType);

      applyDefaultUserAgent(headers);

      const serializedHeaders = toByteStringHeaderObject(headers.normalize(false));

      data = toWebStream(await encodeStringWithoutContentType(data, headers));

      const resolvedOptions = initFromFetchOptions(fetchOptions, envFetch);
      resolvedOptions["signal"] = composedSignal;
      resolvedOptions["method"] = (method as string).toUpperCase();
      resolvedOptions["headers"] = serializedHeaders;
      resolvedOptions["body"] = data;
      resolvedOptions["duplex"] = "half";
      resolvedOptions["credentials"] = isCredentialsSupported ? withCredentials : undefined;

      ctx.stage = "build";
      ctx.request = isRequestSupported
        ? new (Request as AnyConstructor)(ctx.url, resolvedOptions) as Request
        : null;

      if (tooLarge) throw tooLarge(ctx);

      // Pass resolvedOptions as the fetch init even when a Request object is supplied, so the
      // same null-prototype members apply to both calls.
      ctx.stage = "send";
      let response = await (isRequestSupported
        ? _fetch(ctx.request, resolvedOptions)
        : _fetch(ctx.url, resolvedOptions));
      ctx.stage = undefined;

      const responseHeaders = FaxiosHeaders.from(response.headers);

      checkDeclaredContentLength(ctx, responseHeaders);

      if (isStreamResponse && response.body != null) releaseDeadline = holdDeadline(signal);

      response = buildDownloadStream(ctx, { headers: responseHeaders, response });

      responseType = responseType || "text";

      const resolverKey = findKey(resolvers, responseType) || "text";
      const resolver = resolvers[resolverKey];
      ctx.stage = "body";
      const responseData = await (resolver && resolver(response, config));
      ctx.stage = undefined;

      // A response that can stream had its size checked as it was read (buildDownloadStream).
      if (!supportsResponseStream) checkMaterializedSize(ctx, responseData);

      // A stream body releases the request when it ends; a response without a body has nothing to wait for.
      if (!isStreamResponse || response.body == null) unsubscribe();

      return await new Promise((resolve, reject) => {
        settle(resolve, reject, {
          data: responseData,
          headers: responseHeaders,
          status: response.status,
          statusText: response.statusText,
          config,
          request: ctx.request,
        });
      });
    }
    catch (err) {
      let error: unknown = err;
      try {
        handleFetchCaughtError(ctx, err);
      }
      catch (classified) {
        error = classified;
      }
      // Classify first: the abort below sets the composed signal's reason.
      requestController.abort(error);
      unsubscribe();
      releaseDeadline?.();
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
