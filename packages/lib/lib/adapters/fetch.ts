import AxiosError from "../core/AxiosError.js";
import AxiosHeaders from "../core/AxiosHeaders.js";
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
import type { CancelToken } from "../types.js";
import utils from "../utils.js";

// btoa is a global in Node 16+ and browsers; accessed via globalThis for no-DOM lib compat
const _btoa: (data: string) => string = (globalThis as unknown as Record<string, unknown>)["btoa"] as (data: string) => string;
type AnyConstructor = new (...args: Array<unknown>) => unknown;
type FetchFn = (input: unknown, init?: unknown) => Promise<AnyResponse>;
type AnyResponse = {
  body: unknown;
  headers: { has: (name: string) => boolean; get: (name: string) => string | null; [key: string]: unknown; };
  status: number;
  statusText: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
  [key: string]: unknown;
};
type AnyRequest = {
  headers: { has: (name: string) => boolean; get: (name: string) => string | null; };
  body: { cancel: () => Promise<void>; } | null;
  arrayBuffer: () => Promise<ArrayBuffer>;
  [key: string]: unknown;
};
type AnyReadableStream = { cancel: () => Promise<void>; [key: string]: unknown; };
type AnyTextEncoder = { encode: (str: string) => Uint8Array; };

type CancelTokenWithAbortSignal = CancelToken & { toAbortSignal: () => unknown; };
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
  encodeURIComponent(str).replace(/%([0-9A-F]{2})/gi, (_: string, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
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

const test = (fn: (...args: Array<unknown>) => unknown, ...args: Array<unknown>): boolean => {
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
  const globalObject: Record<string, unknown> =
    utils.global !== undefined && utils.global !== null
      ? utils.global
      : globalThis;
  const ReadableStream = globalObject["ReadableStream"] as (AnyConstructor & { prototype: AnyReadableStream; }) | undefined;
  const TextEncoder = globalObject["TextEncoder"] as (new () => AnyTextEncoder) | undefined;

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

  const { fetch: envFetch, Request, Response } = env as {
    fetch?: FetchFn;
    Request?: AnyConstructor;
    Response?: AnyConstructor;
  };
  const _globalFetch = (globalThis as unknown as Record<string, unknown>)["fetch"];
  const isFetchSupported = envFetch ? isFunction(envFetch) : isFunction(_globalFetch);
  const isRequestSupported = isFunction(Request);
  const isResponseSupported = isFunction(Response);

  if (!isFetchSupported) {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const isReadableStreamSupported = isFetchSupported && isFunction(ReadableStream);

  const encodeText: (str: string) => Promise<Uint8Array> | Uint8Array =
    (typeof TextEncoder === "function"
      ? (
        (encoder: AnyTextEncoder) => (str: string) =>
          encoder.encode(str)
      )(new TextEncoder())
      : async (str: string) => new Uint8Array(await (new (Request as AnyConstructor)(str) as AnyRequest).arrayBuffer()));

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
        request.body.cancel();
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      return duplexAccessed && !hasContentType;
    });

  const supportsResponseStream =
    isResponseSupported &&
    isReadableStreamSupported &&
    test(() => utils.isReadableStream!((new (Response as AnyConstructor)("") as AnyResponse).body));

  const resolvers: Record<string, ((res: AnyResponse, config?: unknown) => unknown) | false> = {
    stream: supportsResponseStream && ((res: AnyResponse) => res.body),
  };

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  isFetchSupported &&
    (() => {
      [ "text", "arrayBuffer", "blob", "formData", "stream" ].forEach(type => {
        !resolvers[type] &&
          (resolvers[type] = (res: AnyResponse, config?: unknown) => {
            const method = res && (res as Record<string, unknown>)[type];

            if (method) {
              return (method as (this: AnyResponse) => unknown).call(res);
            }

            throw new AxiosError(
              `Response type '${type}' is not supported`,
              AxiosError.ERR_NOT_SUPPORT,
              config as import("../types.js").InternalAxiosRequestConfig
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

  const resolveBodyLength = async (headers: import("../types.js").AxiosRequestHeaders, body: unknown): Promise<number | undefined> => {
    const length = utils.toFiniteNumber((headers.getContentLength)());

    return length == null ? getBodyLength(body) : length;
  };

  // eslint-disable-next-line sonarjs/cognitive-complexity
  return async (config: import("../types.js").InternalAxiosRequestConfig) => {
    const _resolved = resolveConfig(config) as import("../types.js").InternalAxiosRequestConfig & {
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
    let withCredentials: string | boolean = _resolved.withCredentials ?? "same-origin";

    const hasMaxContentLength = utils.isNumber(maxContentLength) && maxContentLength! > -1;
    const hasMaxBodyLength = utils.isNumber(maxBodyLength) && maxBodyLength! > -1;
    const own = (key: string): unknown => (utils.hasOwnProp(config, key) ? (config as unknown as Record<string, unknown>)[key] : undefined);

    let _fetch: FetchFn = (envFetch || _globalFetch) as FetchFn;

    responseType = (responseType ? (responseType + "").toLowerCase() : "text") as typeof responseType;

    let composedSignal = composeSignals(
      [ signal, cancelToken && (cancelToken as CancelTokenWithAbortSignal).toAbortSignal() ],
      timeout
    ) as ComposedSignal | undefined;

    let request: unknown = null;

    const unsubscribe =
      composedSignal &&
      composedSignal.unsubscribe &&
      (() => {
        (composedSignal).unsubscribe!();
      });

    let requestContentLength;

    // AxiosError we raise while the request body is being streamed. Captured
    // by identity so the catch block can surface it directly, regardless of
    // how the runtime wraps the resulting fetch rejection (undici exposes it
    // as `err.cause`; some browsers drop the original error entirely).
    let pendingBodyError: (AxiosError & { request?: unknown; }) | null = null;

    const maxBodyLengthError = () =>
      new AxiosError(
        "Request body larger than maxBodyLength limit",
        AxiosError.ERR_BAD_REQUEST,
        config,
        request
      );

    try {
      // HTTP basic authentication
      let auth = undefined;
      const configAuth = own("auth");

      if (configAuth) {
        const username = utils.getSafeProp(configAuth, "username") || "";
        const password = utils.getSafeProp(configAuth, "password") || "";
        auth = {
          username,
          password,
        };
      }

      if (maybeWithAuthCredentials(url!)) {
        const parsedURL = new URL(url!, platform.origin);

        if (!auth && (parsedURL.username || parsedURL.password)) {
          const urlUsername = decodeURIComponentSafe(parsedURL.username);
          const urlPassword = decodeURIComponentSafe(parsedURL.password);
          auth = {
            username: urlUsername,
            password: urlPassword,
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
          "Basic " + _btoa(encodeUTF8(String(auth.username || "") + ":" + String(auth.password || "")))
        );
      }

      // Enforce maxContentLength for data: URLs up-front so we never materialize
      // an oversized payload. The HTTP adapter applies the same check (see http.js
      // "if (protocol === 'data:')" branch).
      if (hasMaxContentLength && typeof url === "string" && url.startsWith("data:")) {
        const estimated = estimateDataURLDecodedBytes(url);
        if (estimated > maxContentLength!) {
          throw new AxiosError(
            "maxContentLength size of " + maxContentLength + " exceeded",
            AxiosError.ERR_BAD_RESPONSE,
            config,
            request
          );
        }
      }

      // Enforce maxBodyLength against known-size bodies before dispatch using
      // the body's *actual* size — never a caller-declared Content-Length,
      // which could under-report to slip an oversized body past the check.
      // Unknown-size streams return undefined here and are counted per-chunk
      // below as fetch consumes them.
      if (hasMaxBodyLength && method !== "get" && method !== "head") {
        const outboundLength = await getBodyLength(data);
        if (typeof outboundLength === "number" && isFinite(outboundLength)) {
          requestContentLength = outboundLength;
          if (outboundLength > maxBodyLength!) {
            throw maxBodyLengthError();
          }
        }
      }

      // A streamed body under maxBodyLength must be counted as fetch consumes
      // it; its size is never trusted from a caller-declared Content-Length.
      const mustEnforceStreamBody =
        hasMaxBodyLength && (utils.isReadableStream!(data) || utils.isStream(data));

      const trackRequestStream = (stream: unknown, onProgress?: (bytes: number) => void, flush?: () => void) =>
        trackStream(
          stream,
          DEFAULT_CHUNK_SIZE,
          (loadedBytes: number) => {
            if (hasMaxBodyLength && loadedBytes > maxBodyLength!) {
              pendingBodyError = maxBodyLengthError();
              throw pendingBodyError;
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
          requestContentLength == null ? await resolveBodyLength(headers, data) : requestContentLength;

        // A declared length of 0 is only trusted to skip the wrap when we are
        // not enforcing a stream limit (which must not rely on that header).
        if (requestContentLength !== 0 || mustEnforceStreamBody) {
          let _request = new (Request as AnyConstructor)(url!, {
            method: "POST",
            body: data,
            duplex: "half",
          }) as AnyRequest;

          let contentTypeHeader: string | null;

          if (utils.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) {
            (headers.setContentType)(contentTypeHeader);
          }

          if (_request.body) {
             
            const [ onProgress, flush ] = onUploadProgress
              ? progressEventDecorator(
                requestContentLength,
                progressEventReducer(asyncDecorator(onUploadProgress as (...args: Array<unknown>) => unknown), false)
              )
              : [];

            data = trackRequestStream(_request.body, onProgress, flush);
          }
        }
      }
      else if (
        mustEnforceStreamBody &&
        !isRequestSupported &&
        isReadableStreamSupported &&
        method !== "get" &&
        method !== "head"
      ) {
        data = trackRequestStream(data);
      }
      else if (
        mustEnforceStreamBody &&
        isRequestSupported &&
        !supportsRequestStream &&
        method !== "get" &&
        method !== "head"
      ) {
        throw new AxiosError(
          "Stream request bodies are not supported by the current fetch implementation",
          AxiosError.ERR_NOT_SUPPORT,
          config,
          request
        );
      }

      if (!utils.isString(withCredentials)) {
        withCredentials = withCredentials ? "include" : "omit";
      }

      // Cloudflare Workers throws when credentials are defined
      // see https://github.com/cloudflare/workerd/issues/902
      const isCredentialsSupported = isRequestSupported && Request != null && "credentials" in ((Request).prototype as object);

      // If data is FormData and Content-Type is multipart/form-data without boundary,
      // delete it so fetch can set it correctly with the boundary
      if (utils.isFormData(data)) {
        const contentType = (headers.getContentType)() as string | null | undefined;
        if (
          contentType &&
          /^multipart\/form-data/i.test(contentType) &&
          !/boundary=/i.test(contentType)
        ) {
          headers.delete("content-type");
        }
      }

      // Set User-Agent header if not already set (fetch defaults to 'node' in Node.js)
      headers.set("User-Agent", "axios/" + VERSION, false);

      const resolvedOptions = {
        ...fetchOptions,
        signal: composedSignal,
        method: (method as string).toUpperCase(),
        headers: toByteStringHeaderObject(headers.normalize(false) as AxiosHeaders),
        body: data,
        duplex: "half",
        credentials: isCredentialsSupported ? withCredentials : undefined,
      };

      request = isRequestSupported && new (Request as AnyConstructor)(url!, resolvedOptions);

      let response = await (isRequestSupported
        ? _fetch(request, fetchOptions)
        : _fetch(url!, resolvedOptions));

      const responseHeaders = AxiosHeaders.from(response.headers);

      // Cheap pre-check: if the server honestly declares a content-length that
      // already exceeds the cap, reject before we start streaming.
      if (hasMaxContentLength) {
        const declaredLength = utils.toFiniteNumber((responseHeaders.getContentLength as () => unknown)());
        if (declaredLength != null && declaredLength > maxContentLength!) {
          throw new AxiosError(
            "maxContentLength size of " + maxContentLength + " exceeded",
            AxiosError.ERR_BAD_RESPONSE,
            config,
            request
          );
        }
      }

      const isStreamResponse =
        supportsResponseStream && (responseType === "stream" || responseType === "response");

      if (
        supportsResponseStream &&
        response.body &&
        (onDownloadProgress || hasMaxContentLength || (isStreamResponse && unsubscribe))
      ) {
        const options: Record<string, unknown> = {};

        [ "status", "statusText", "headers" ].forEach(prop => {
          options[prop] = response[prop];
        });

        const responseContentLength = utils.toFiniteNumber((responseHeaders.getContentLength as () => unknown)());
         
        const [ onProgress, flush ] = onDownloadProgress
          ? progressEventDecorator(
            responseContentLength,
            progressEventReducer(asyncDecorator(onDownloadProgress as (...args: Array<unknown>) => unknown), true)
          )
          : [];

        let bytesRead = 0;
        const onChunkProgress = (loadedBytes: number): void => {
          if (hasMaxContentLength) {
            bytesRead = loadedBytes;
            if (bytesRead > maxContentLength!) {
              throw new AxiosError(
                "maxContentLength size of " + maxContentLength + " exceeded",
                AxiosError.ERR_BAD_RESPONSE,
                config,
                request
              );
            }
          }
          onProgress && onProgress(loadedBytes);
        };

        response = new (Response as AnyConstructor)(
          trackStream(response.body, DEFAULT_CHUNK_SIZE, onChunkProgress, () => {
            flush && flush();
            unsubscribe && unsubscribe();
          }),
          options
        ) as AnyResponse;
      }

      responseType = responseType || "text";

      const resolverKey = utils.findKey(resolvers, responseType) || "text";
      const resolver = resolvers[resolverKey];
      let responseData = await (resolver && (resolver)(response, config));

      // Fallback enforcement for environments without ReadableStream support
      // (legacy runtimes). Detect materialized size from typed output; skip
      // streams/Response passthrough since the user will read those themselves.
      if (hasMaxContentLength && !supportsResponseStream && !isStreamResponse) {
        let materializedSize;
        if (responseData != null) {
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
        }
        if (typeof materializedSize === "number" && materializedSize > maxContentLength!) {
          throw new AxiosError(
            "maxContentLength size of " + maxContentLength + " exceeded",
            AxiosError.ERR_BAD_RESPONSE,
            config,
            request
          );
        }
      }

      !isStreamResponse && unsubscribe && unsubscribe();

      return await new Promise((resolve, reject) => {
        settle(resolve, reject, {
          data: responseData,
          headers: AxiosHeaders.from(response.headers),
          status: response.status,
          statusText: response.statusText,
          config,
          request,
        });
      });
    }
    catch (err) {
      unsubscribe && unsubscribe();

      // Safari can surface fetch aborts as a DOMException-like object whose
      // branded getters throw. Prefer our composed signal reason before reading
      // the caught error, preserving timeout vs cancellation semantics.
      if (composedSignal && composedSignal.aborted && composedSignal.reason instanceof AxiosError) {
        const canceledError = composedSignal.reason;
        canceledError.config = config;
        request && (canceledError.request = request);
        err !== canceledError && (canceledError.cause = err as Error);
        throw canceledError;
      }

      // Surface a maxBodyLength violation we raised while the request body was
      // being streamed. Matching by identity (rather than reading
      // `err.cause.isAxiosError`) keeps the error deterministic across runtimes
      // and avoids both prototype-pollution reads and mis-attributing a foreign
      // AxiosError that merely happened to land in `err.cause`.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (pendingBodyError) {
        const _pbe = pendingBodyError as AxiosError & { request?: unknown; };
        request && !_pbe.request && (_pbe.request = request);
        throw pendingBodyError;
      }

      // Re-throw AxiosErrors we raised synchronously (data: URL / content-length
      // pre-checks, response size enforcement) without re-wrapping them.
      if (err instanceof AxiosError) {
        request && !err.request && (err.request = request);
        throw err;
      }

      const _err = err as Record<string, unknown> & Error;
      if (_err && _err.name === "TypeError" && /Load failed|fetch/i.test(_err.message)) {
        throw Object.assign(
          new AxiosError(
            "Network Error",
            AxiosError.ERR_NETWORK,
            config,
            request,
            _err["response"] as import("../types.js").AxiosResponse | undefined
          ),
          {
            cause: _err["cause"] || _err,
          }
        );
      }

      throw AxiosError.from(
        _err,
        _err && (_err["code"] as string | undefined),
        config,
        request,
        _err && (_err["response"] as import("../types.js").AxiosResponse | undefined)
      );
    }
  };
};

const seedCache = new Map<unknown, unknown>();

export const getFetch = (config?: { env?: Record<string, unknown>; }) => {
  const env: Record<string, unknown> = (config && config.env) || {};
  const { fetch, Request, Response } = env as { fetch?: unknown; Request?: unknown; Response?: unknown; };
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
