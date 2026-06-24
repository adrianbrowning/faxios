import FaxiosError from "../core/FaxiosError.js";
import FaxiosHeaders from "../core/FaxiosHeaders.js";
import settle from "../core/settle.js";
import { VERSION } from "../env/data.js";
import composeSignals from "../helpers/composeSignals.js";
import estimateDataURLDecodedBytes from "../helpers/estimateDataURLDecodedBytes.js";
import {
  progressEventReducer,
  progressEventDecorator,
  asyncDecorator
} from "../helpers/progressEventReducer.js";
import resolveConfig from "../helpers/resolveConfig.js";
import { toByteStringHeaderObject } from "../helpers/sanitizeHeaderValue.js";
import { trackStream } from "../helpers/trackStream.js";
import platform from "../platform/index.js";
import type {
  CancelToken,
  InternalFaxiosRequestConfig,
  FaxiosRequestHeaders,
  FaxiosResponse
} from "../types.js";
import utils from "../utils.js";

// btoa is a global in Node 16+ and browsers; accessed via globalThis for no-DOM lib compat
const _btoa: (data: string) => string = (
  globalThis as unknown as Record<string, unknown>
)["btoa"] as (data: string) => string;
type AnyConstructor = new (...args: Array<unknown>) => unknown;
type FetchFn = (input: unknown, init?: unknown) => Promise<AnyResponse>;
type AnyResponse = {
  body: unknown;
  headers: {
    has: (name: string) => boolean;
    get: (name: string) => string | null;
    [key: string]: unknown;
  };
  status: number;
  statusText: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
  [key: string]: unknown;
};
type AnyRequest = {
  headers: {
    has: (name: string) => boolean;
    get: (name: string) => string | null;
  };
  body: { cancel: () => Promise<void>; } | null;
  arrayBuffer: () => Promise<ArrayBuffer>;
  [key: string]: unknown;
};
type AnyReadableStream = {
  cancel: () => Promise<void>;
  [key: string]: unknown;
};
type AnyTextEncoder = { encode: (str: string) => Uint8Array; };

type CancelTokenWithAbortSignal = CancelToken & {
  toAbortSignal: () => unknown;
};
type ComposedSignal = AbortSignal & { unsubscribe?: () => void; };

const DEFAULT_CHUNK_SIZE = 64 * 1024;

const { isFunction } = utils;

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
  let urlToCheck = url;
  if (protocolIndex !== -1) {
    urlToCheck = urlToCheck.slice(protocolIndex + 3);
  }
  return urlToCheck.includes("@") || urlToCheck.includes(":");
};

// eslint-disable-next-line sonarjs/function-return-type
const factory = (env: Record<string, unknown>) => {
  const globalObject: Record<string, unknown> = utils.global ?? globalThis as unknown as Record<string, unknown>;
  const ReadableStream = globalObject["ReadableStream"] as
    | (AnyConstructor & { prototype: AnyReadableStream; })
    | undefined;
  const TextEncoder = globalObject["TextEncoder"] as
    | (new () => AnyTextEncoder)
    | undefined;

  env = utils.merge.call(
    {
      skipUndefined: true,
    },
    {
      Request: globalObject["Request"],
      Response: globalObject["Response"],
    },
    env
  );

  const {
    fetch: envFetch,
    Request,
    Response,
  } = env as {
    fetch?: FetchFn;
    Request?: AnyConstructor;
    Response?: AnyConstructor;
  };
  const _globalFetch = (globalThis as unknown as Record<string, unknown>)[
    "fetch"
  ];
  const isFetchSupported = envFetch
    ? isFunction(envFetch)
    : isFunction(_globalFetch);
  const isRequestSupported = isFunction(Request);
  const isResponseSupported = isFunction(Response);

  if (!isFetchSupported) {
    return false;
  }

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
        void request.body.cancel();
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      return duplexAccessed && !hasContentType;
    });

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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  isFetchSupported &&
    (() => {
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
    })();

  const getBodyLength = async (body: unknown): Promise<number | undefined> => {
    if (body == null) {
      return 0;
    }

    if (utils.isBlob(body)) {
      return (body as { size: number; }).size;
    }

    if (utils.isSpecCompliantForm(body)) {
      const _request = new (Request as AnyConstructor)(platform.origin, {
        method: "POST",
        body,
      }) as AnyRequest;
      return (await _request.arrayBuffer()).byteLength;
    }

    if (utils.isArrayBufferView(body) || utils.isArrayBuffer(body)) {
      return (body as ArrayBufferView | ArrayBuffer).byteLength;
    }

    if (utils.isURLSearchParams(body)) {
      body = body + "";
    }

    if (utils.isString(body)) {
      return (await encodeText(body as string)).byteLength;
    }
    return undefined;
  };

  const resolveBodyLength = async (
    headers: FaxiosRequestHeaders,
    body: unknown
  ): Promise<number | undefined> => {
    const length = utils.toFiniteNumber(headers.getContentLength());

    return length == null ? getBodyLength(body) : length;
  };

  type PendingBodyErrorRef = { value: (FaxiosError & { request?: unknown; }) | null; };

  const normalizeCredentials = (wc: string | boolean): string => {
    if (utils.isString(wc)) return wc as string;
    return wc ? "include" : "omit";
  };

  // HTTP basic authentication: extract auth from config or URL, set Authorization header,
  // strip credentials from URL. Returns the (possibly updated) URL.
  const applyAuthToRequest = (
    url: string,
    headers: FaxiosRequestHeaders,
    own: (key: string) => unknown
  ): string => {
    let auth: { username: unknown; password: unknown; } | undefined;
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
    if (hasMaxBodyLength && method !== "get" && method !== "head") {
      const outboundLength = await getBodyLength(data);
      if (typeof outboundLength === "number" && isFinite(outboundLength)) {
        if (outboundLength > maxBodyLength) {
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
    headers: FaxiosRequestHeaders,
    requestContentLength: number | undefined,
    onUploadProgress: unknown,
    _trackStream: (stream: unknown, onProgress?: (bytes: number) => void, flush?: () => void) => unknown
  ): unknown => {
    let contentTypeHeader: string | null;
    if (
      utils.isFormData(data) &&
      (contentTypeHeader = _request.headers.get("content-type"))
    ) {
      headers.setContentType(contentTypeHeader);
    }
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
    headers: FaxiosRequestHeaders,
    onUploadProgress: unknown,
    mustEnforceStreamBody: boolean,
    requestContentLength: number | undefined,
    hasMaxBodyLength: boolean,
    maxBodyLength: number,
    config: InternalFaxiosRequestConfig,
    request: unknown,
    pendingBodyErrorRef: PendingBodyErrorRef
  ): Promise<{ data: unknown; requestContentLength: number | undefined; }> => {
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
        flush
      );

    if (
      supportsRequestStream &&
      method !== "get" &&
      method !== "head" &&
      (onUploadProgress || mustEnforceStreamBody)
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
        data = applyUploadProgress(_request, data, headers, requestContentLength, onUploadProgress, _trackStream);
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

    return { data, requestContentLength };
  };

  // If data is FormData and Content-Type is multipart/form-data without boundary,
  // delete it so fetch can set it correctly with the boundary.
  const cleanFormDataContentType = (
    data: unknown,
    headers: FaxiosRequestHeaders
  ): void => {
    if (utils.isFormData(data)) {
      const contentType = headers.getContentType() as string | null | undefined;
      if (
        contentType &&
        /^multipart\/form-data/i.test(contentType) &&
        !/boundary=/i.test(contentType)
      ) {
        headers.delete("content-type");
      }
    }
  };

  // Cheap pre-check: if the server declares a content-length exceeding the cap, reject early.
  const checkDeclaredContentLength = (
    responseHeaders: FaxiosHeaders,
    hasMaxContentLength: boolean,
    maxContentLength: number,
    config: InternalFaxiosRequestConfig,
    request: unknown
  ): void => {
    if (!hasMaxContentLength) return;
    const declaredLength = utils.toFiniteNumber(
      (responseHeaders.getContentLength as () => unknown)()
    );
    if (declaredLength != null && declaredLength > maxContentLength) {
      throw new FaxiosError(
        "maxContentLength size of " + maxContentLength + " exceeded",
        FaxiosError.ERR_BAD_RESPONSE,
        config,
        request
      );
    }
  };

  // Wrap the response body stream with download progress tracking and maxContentLength enforcement.
  const buildDownloadStream = (
    response: AnyResponse,
    responseHeaders: FaxiosHeaders,
    onDownloadProgress: unknown,
    hasMaxContentLength: boolean,
    maxContentLength: number,
    isStreamResponse: boolean,
    unsubscribe: (() => void) | false | undefined,
    config: InternalFaxiosRequestConfig,
    request: unknown
  ): AnyResponse => {
    const needsWrapping = onDownloadProgress || hasMaxContentLength || (isStreamResponse && unsubscribe);
    if (!supportsResponseStream || !response.body || !needsWrapping) {
      return response;
    }

    const options: Record<string, unknown> = {};
    [ "status", "statusText", "headers" ].forEach(prop => {
      options[prop] = response[prop];
    });

    const responseContentLength = utils.toFiniteNumber(
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
        () => {
          flush && flush();
          unsubscribe && unsubscribe();
        }
      ),
      options
    ) as AnyResponse;
  };

  // Fallback enforcement for environments without ReadableStream support (legacy runtimes).
  // Detects materialized size from typed output; skips streams/Response passthrough.
  const checkMaterializedSize = (
    responseData: unknown,
    hasMaxContentLength: boolean,
    maxContentLength: number,
    isStreamResponse: boolean,
    config: InternalFaxiosRequestConfig,
    request: unknown
  ): void => {
    if (!hasMaxContentLength || supportsResponseStream || isStreamResponse) return;
    if (responseData == null) return;
    let materializedSize: number | undefined;
    const rd = responseData as Record<string, unknown>;
    if (typeof rd["byteLength"] === "number") {
      materializedSize = rd["byteLength"];
    }
    else if (typeof rd["size"] === "number") {
      materializedSize = rd["size"];
    }
    else if (typeof responseData === "string") {
      materializedSize =
        typeof TextEncoder === "function"
          ? new TextEncoder().encode(responseData).byteLength
          : responseData.length;
    }
    if (typeof materializedSize === "number" && materializedSize > maxContentLength) {
      throw new FaxiosError(
        "maxContentLength size of " + maxContentLength + " exceeded",
        FaxiosError.ERR_BAD_RESPONSE,
        config,
        request
      );
    }
  };

  // Handle errors caught from the fetch call, re-throwing as appropriate FaxiosErrors.
  const handleFetchCaughtError = (
    err: unknown,
    composedSignal: ComposedSignal | undefined,
    pendingBodyErrorRef: PendingBodyErrorRef,
    config: InternalFaxiosRequestConfig,
    request: unknown
  ): never => {
    // Safari can surface fetch aborts as a DOMException-like object whose
    // branded getters throw. Prefer our composed signal reason before reading
    // the caught error, preserving timeout vs cancellation semantics.
    if (
      composedSignal &&
      composedSignal.aborted &&
      composedSignal.reason instanceof FaxiosError
    ) {
      const canceledError = composedSignal.reason;
      canceledError.config = config;
      request && (canceledError.request = request);
      err !== canceledError && (canceledError.cause = err as Error);
      throw canceledError;
    }

    // Surface a maxBodyLength violation we raised while the request body was
    // being streamed. Matching by identity keeps the error deterministic across
    // runtimes and avoids prototype-pollution reads.
    if (pendingBodyErrorRef.value) {
      const _pbe = pendingBodyErrorRef.value;
      request && !_pbe.request && (_pbe.request = request);
      throw _pbe;
    }

    // Re-throw FaxiosErrors we raised synchronously without re-wrapping them.
    if (err instanceof FaxiosError) {
      request && !err.request && (err.request = request);
      throw err;
    }

    const _err = err as Record<string, unknown> & Error;
    if (
      _err.name === "TypeError" &&
      /Load failed|fetch/i.test(_err.message)
    ) {
      throw Object.assign(
        new FaxiosError(
          "Network Error",
          FaxiosError.ERR_NETWORK,
          config,
          request,
          _err["response"] as FaxiosResponse | undefined
        ),
        {
          cause: _err["cause"] || _err,
        }
      );
    }

    throw FaxiosError.from(
      _err,
      _err["code"] as string | undefined,
      config,
      request,
      _err["response"] as FaxiosResponse | undefined
    );
  };

  return async (config: InternalFaxiosRequestConfig) => {
    const _resolved = resolveConfig(config) as InternalFaxiosRequestConfig & {
      fetchOptions?: Record<string, unknown>;
      withCredentials?: string | boolean;
    };
    let {
      url,
      method,
      data,
      signal,
      cancelToken,
      timeout,
      onDownloadProgress,
      onUploadProgress,
      responseType,
      fetchOptions,
      maxContentLength,
      maxBodyLength,
    } = _resolved;
    let headers = _resolved.headers;
    let withCredentials: string | boolean =
      _resolved.withCredentials ?? "same-origin";

    const hasMaxContentLength =
      utils.isNumber(maxContentLength) && maxContentLength! > -1;
    const hasMaxBodyLength =
      utils.isNumber(maxBodyLength) && maxBodyLength! > -1;
    const own = (key: string): unknown =>
      utils.hasOwnProp(config, key)
        ? (config as unknown as Record<string, unknown>)[key]
        : undefined;

    const _fetch: FetchFn = (envFetch || (globalThis as unknown as Record<string, unknown>)["fetch"]) as FetchFn;

    responseType = (
      responseType ? (responseType + "").toLowerCase() : "text"
    ) as typeof responseType;

    const composedSignal = composeSignals(
      [
        signal,
        cancelToken &&
          (cancelToken as CancelTokenWithAbortSignal).toAbortSignal(),
      ],
      timeout
    ) as ComposedSignal | undefined;

    const unsubscribe =
      composedSignal &&
      composedSignal.unsubscribe &&
      (() => {
        composedSignal.unsubscribe!();
      });

    let request: unknown = null;
    const pendingBodyErrorRef: PendingBodyErrorRef = { value: null };

    try {
      url = applyAuthToRequest(url!, headers, own);

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
      const mustEnforceStreamBody =
        hasMaxBodyLength &&
        (utils.isReadableStream!(data) || utils.isStream(data));

      ({ data } = await buildUploadStream(
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

      cleanFormDataContentType(data, headers);

      // Set User-Agent header if not already set (fetch defaults to 'node' in Node.js)
      headers.set("User-Agent", "axios/" + VERSION, false);

      const resolvedOptions = {
        ...fetchOptions,
        signal: composedSignal,
        method: (method as string).toUpperCase(),
        headers: toByteStringHeaderObject(
          headers.normalize(false) as FaxiosHeaders
        ),
        body: data,
        duplex: "half",
        credentials: isCredentialsSupported ? withCredentials : undefined,
      };

      request =
        isRequestSupported &&
        new (Request as AnyConstructor)(url, resolvedOptions);

      let response = await (isRequestSupported
        ? _fetch(request, fetchOptions)
        : _fetch(url, resolvedOptions));

      const responseHeaders = FaxiosHeaders.from(response.headers);

      checkDeclaredContentLength(responseHeaders, hasMaxContentLength, maxContentLength!, config, request);

      const isStreamResponse =
        supportsResponseStream &&
        (responseType === "stream" || responseType === "response");

      response = buildDownloadStream(
        response,
        responseHeaders,
        onDownloadProgress,
        hasMaxContentLength,
        maxContentLength!,
        isStreamResponse,
        unsubscribe,
        config,
        request
      );

      responseType = responseType || "text";

      const resolverKey = utils.findKey(resolvers, responseType) || "text";
      const resolver = resolvers[resolverKey];
      const responseData = await (resolver && resolver(response, config));

      checkMaterializedSize(
        responseData,
        hasMaxContentLength,
        maxContentLength!,
        isStreamResponse,
        config,
        request
      );

      !isStreamResponse && unsubscribe && unsubscribe();

      return await new Promise((resolve, reject) => {
        settle(resolve, reject, {
          data: responseData,
          headers: FaxiosHeaders.from(response.headers),
          status: response.status,
          statusText: response.statusText,
          config,
          request,
        });
      });
    }
    catch (err) {
      unsubscribe && unsubscribe();
      throw handleFetchCaughtError(err, composedSignal, pendingBodyErrorRef, config, request);
    }
  };
};

const seedCache = new Map<unknown, unknown>();

export const getFetch = (config?: { env?: Record<string, unknown>; }) => {
  const env: Record<string, unknown> = (config && config.env) || {};
  const { fetch, Request, Response } = env as {
    fetch?: unknown;
    Request?: unknown;
    Response?: unknown;
  };
  const seeds: Array<unknown> = [ Request, Response, fetch ];

  const len = seeds.length;
  let i = len;
  let seed: unknown;
  let target: unknown;
  let map: Map<unknown, unknown> = seedCache;

  while (i--) {
    seed = seeds[i];
    target = map.get(seed);

    if (target === undefined) {
      target = i ? new Map<unknown, unknown>() : factory(env);
      map.set(seed, target);
    }

    map = target as Map<unknown, unknown>;
  }

  return target;
};

const adapter = getFetch();

export default adapter;
