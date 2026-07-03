"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import type {
  InternalFaxiosRequestConfig,
  FaxiosRequestHeaders,
  FaxiosResponse
} from "../types.js";
import utils from "../utils.js";

export type ComposedSignal = AbortSignal & { unsubscribe?: () => void; };
export type PendingBodyErrorRef = { value: (FaxiosError & { request?: unknown; }) | null; };

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

// ponytail: exported for unit testing only — not part of public API
export const handleFetchCaughtError = (
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

// ponytail: exported for unit testing only — not part of public API
export const cleanFormDataContentType = (
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
