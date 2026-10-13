"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import type {
  FaxiosRequestHeaders,
  FaxiosResponse,
  InternalFaxiosRequestConfig
} from "../types.js";
import utils from "../utils.js";

export type ComposedSignal = AbortSignal & { unsubscribe?: () => void; };
export type PendingBodyErrorRef = { value: (FaxiosError & { request?: unknown; }) | null; };
// The adapter step a failure came from: building the Request, sending it, or reading the body.
export type FetchStage = "body" | "build" | "send";

const _textEncoder: TextEncoder | undefined =
  typeof globalThis.TextEncoder === "function" ? new globalThis.TextEncoder() : undefined;

// ponytail: exported for unit testing only — not part of public API
export const checkDeclaredContentLength = (
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

// ponytail: exported for unit testing only — not part of public API
export const checkMaterializedSize = (
  responseData: unknown,
  hasMaxContentLength: boolean,
  maxContentLength: number,
  isStreamResponse: boolean,
  supportsResponseStream: boolean,
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
    materializedSize = _textEncoder
      ? _textEncoder.encode(responseData).byteLength
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

// Request and fetch reject an unparseable URL with a code-less TypeError. Outside the browser
// (or Deno without --location) there's no base, so a relative URL can't parse.
const isUnparseableURL = (url: string): boolean => {
  const location: unknown = Reflect.get(globalThis, "location");
  const base = typeof location === "object" && location !== null && "href" in location && typeof location.href === "string"
    ? location.href
    : undefined;
  try {
    new URL(url, base);
    return false;
  }
  catch {
    return true;
  }
};

// Gives a code-less TypeError the code for the adapter step it came from. A "send" TypeError
// that isn't a URL problem falls through to the network-error check.
const throwStagedTypeError = (
  err: Error,
  stage: FetchStage,
  url: string | undefined,
  config: InternalFaxiosRequestConfig,
  request: unknown
): void => {
  if (stage !== "body" && url !== undefined && isUnparseableURL(url)) {
    const message = /^[a-z][a-z\d+\-.]*:/i.test(url)
      ? "Invalid URL"
      : "Invalid URL: a relative URL needs a baseURL outside the browser";
    throw Object.assign(
      new FaxiosError(message, FaxiosError.ERR_INVALID_URL, config, request),
      { cause: err }
    );
  }
  if (stage === "build") {
    throw FaxiosError.from(err, FaxiosError.ERR_BAD_REQUEST, config, request);
  }
  // A body that fails mid-stream (connection reset, "terminated") is a network failure.
  if (stage === "body") {
    throw FaxiosError.from(err, FaxiosError.ERR_NETWORK, config, request);
  }
};

// ponytail: exported for unit testing only — not part of public API
export const handleFetchCaughtError = (
  err: unknown,
  composedSignal: ComposedSignal | undefined,
  pendingBodyErrorRef: PendingBodyErrorRef,
  config: InternalFaxiosRequestConfig,
  request: unknown,
  stage?: FetchStage,
  url?: string
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
    // A cancellation already carries the abort reason as its cause; keep it.
    err !== canceledError && canceledError.cause === undefined && (canceledError.cause = err as Error);
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
  if (_err.name === "TypeError" && stage) {
    throwStagedTypeError(_err, stage, url, config, request);
  }
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

// ponytail: exported for unit testing only — not part of public API
export const cleanFormDataContentType = (
  data: unknown,
  headers: FaxiosRequestHeaders
): void => {
  if (utils.isFormData(data)) {
    const contentType = headers.getContentType() as null | string | undefined;
    if (
      contentType &&
      /^multipart\/form-data/i.test(contentType) &&
      !/boundary=/i.test(contentType)
    ) {
      headers.delete("content-type");
    }
  }
};

// ponytail: exported for unit testing only — not part of public API
export const encodeBodyIfNeeded = (
  data: unknown,
  headers: Record<string, unknown>,
  encode: (str: string) => Promise<Uint8Array> | Uint8Array
): Promise<unknown> | unknown => {
  if (!utils.isString(data) || utils.findKey(headers, "content-type")) return data;
  // ponytail: skip await when TextEncoder is sync (avoids microtask hop on every string body)
  return encode(data as string);
};
