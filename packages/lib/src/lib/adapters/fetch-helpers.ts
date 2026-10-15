"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import stripUserInfo from "../helpers/stripUserInfo.js";
import utf8ByteLength from "../helpers/utf8ByteLength.js";
import type {
  FaxiosResponse,
  InternalFaxiosRequestConfig
} from "../types.js";
import utils from "../utils.js";

export type ComposedSignal = AbortSignal & { unsubscribe?: () => void; };
export type PendingBodyErrorRef = { value: (FaxiosError & { request?: unknown; }) | null; };
// The adapter step a failure came from: building the Request, sending it, or reading the body.
export type FetchStage = "body" | "build" | "send";

// A HEAD response and these statuses have no body, so their Content-Length isn't what they send.
const BODILESS_STATUSES: ReadonlyArray<number> = [ 204, 205, 304 ];

// ponytail: exported for unit testing only — not part of public API
export const checkDeclaredContentLength = (
  responseHeaders: FaxiosHeaders,
  method: string,
  status: number,
  hasMaxContentLength: boolean,
  maxContentLength: number,
  config: InternalFaxiosRequestConfig,
  request: unknown
): void => {
  if (!hasMaxContentLength || method === "head" || BODILESS_STATUSES.includes(status)) return;
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

// The body is measured once read unless the counting stream wrapper read it: a runtime without
// stream responses, or a Response-like value from `env.fetch` with no stream body, skips the
// wrapper.
// ponytail: exported for unit testing only — not part of public API
export const checkMaterializedSize = (
  responseData: unknown,
  hasMaxContentLength: boolean,
  maxContentLength: number,
  isCountedWhileRead: boolean,
  config: InternalFaxiosRequestConfig,
  request: unknown
): void => {
  if (!hasMaxContentLength || isCountedWhileRead || responseData == null) return;
  let materializedSize: number | undefined;
  const rd = responseData as Record<string, unknown>;
  if (typeof rd["byteLength"] === "number") {
    materializedSize = rd["byteLength"];
  }
  else if (typeof rd["size"] === "number") {
    materializedSize = rd["size"];
  }
  else if (typeof responseData === "string") {
    materializedSize = utf8ByteLength(responseData);
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

// With neither `url` nor `baseURL` (or a middleware that set `url` to a non-string) there is no
// URL to send to.
export const requireRequestURL = (url: unknown, config: InternalFaxiosRequestConfig): string => {
  if (typeof url !== "string") {
    throw new FaxiosError("Invalid URL: no url or baseURL given", FaxiosError.ERR_INVALID_URL, config);
  }
  return url;
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

// `Network Error: ENOTFOUND (GET https://host/path)`: the runtime's reason (its error code, else
// its message) and the request. The URL loses its user info, query and fragment, which often
// carry secrets.
const networkErrorMessage = (cause: unknown, config: InternalFaxiosRequestConfig, url: string | undefined): string => {
  const code = utils.getSafeProp(cause, "code");
  let reason = "";
  if (typeof code === "string" && code) reason = code;
  else if (cause instanceof Error && cause.message) reason = cause.message;
  const method = utils.getSafeProp(config, "method");
  const verb = (typeof method === "string" ? method : "get").toUpperCase();
  let target = "";
  if (typeof url === "string") {
    const safe = stripUserInfo(url);
    const end = safe.search(/[?#]/);
    target = ` (${verb} ${end === -1 ? safe : safe.slice(0, end)})`;
  }
  return reason ? `Network Error: ${reason}${target}` : `Network Error${target}`;
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
  // fetch rejecting while sending is a transport failure. Runtimes word it differently (Node's
  // "fetch failed", Bun's ConnectionRefused, Deno's "client error (Connect)"), so the stage
  // decides, not the message.
  if (stage === "send") {
    const cause: unknown = _err["cause"] || _err;
    throw Object.assign(
      new FaxiosError(
        networkErrorMessage(cause, config, url),
        FaxiosError.ERR_NETWORK,
        config,
        request,
        _err["response"] as FaxiosResponse | undefined
      ),
      { cause }
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

// fetch sends a string body as `text/plain;charset=UTF-8` when there's no Content-Type. A
// Content-Type of `null` or `false` keeps the header off, so that string goes out as its bytes.
export const encodeStringWithoutContentType = (
  data: unknown,
  headers: FaxiosHeaders,
  encode: (str: string) => Promise<Uint8Array> | Uint8Array
): Promise<unknown> | unknown => {
  if (typeof data !== "string") return data;
  const key = utils.findKey(headers, "content-type");
  const contentType = key ? headers[key] : undefined;
  return contentType === null || contentType === false ? encode(data) : data;
};
