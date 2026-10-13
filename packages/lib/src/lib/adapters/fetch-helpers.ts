"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import stripUserInfo from "../helpers/stripUserInfo.js";
import type {
  FaxiosResponse,
  InternalFaxiosRequestConfig
} from "../types.js";
import { getSafeProp, toFiniteNumber } from "../utils.js";

export type ComposedSignal = AbortSignal & { unsubscribe?: () => void; };
// The adapter step a failure came from: building the Request, sending it, or reading the body.
type FetchStage = "body" | "build" | "send";

// One request's state, shared by the fetch adapter's helpers.
export type FetchContext = {
  config: InternalFaxiosRequestConfig;
  headers: FaxiosHeaders;
  // `responseType: "stream"` where responses can stream: the body outlives the adapter call.
  isStreamResponse: boolean;
  // `maxBodyLength` and `maxContentLength` in bytes; `undefined` when unset.
  limits: { body: number | undefined; content: number | undefined; };
  method: string;
  // An error raised while fetch read the request body (over `limits.body`, or a chunk
  // trackStream rejected); it is the request's error, not whatever fetch rejects with.
  pendingBodyError: FaxiosError | null;
  progress: { download: unknown; upload: unknown; };
  // Ends a stream response: releases the request and, given an error, aborts it.
  releaseStreamBody: (err?: unknown) => void;
  // The Request given to fetch: null until it is built, and where Request isn't available.
  request: null | Request;
  signal: ComposedSignal;
  // Which step a code-less TypeError came from, so it can get a code.
  stage: FetchStage | undefined;
  url: string;
};

const _textEncoder: TextEncoder | undefined =
  typeof globalThis.TextEncoder === "function" ? new globalThis.TextEncoder() : undefined;

// The one place each size-limit error is defined. They read `ctx.request` when raised.
export const contentTooLarge = (ctx: FetchContext): FaxiosError =>
  new FaxiosError(
    "maxContentLength size of " + ctx.limits.content + " exceeded",
    FaxiosError.ERR_BAD_RESPONSE,
    ctx.config,
    ctx.request
  );

export const bodyTooLarge = (ctx: FetchContext): FaxiosError =>
  new FaxiosError(
    "Request body larger than maxBodyLength limit",
    FaxiosError.ERR_BAD_REQUEST,
    ctx.config,
    ctx.request
  );

export const checkDeclaredContentLength = (ctx: FetchContext, responseHeaders: FaxiosHeaders): void => {
  if (ctx.limits.content === undefined) return;
  const declaredLength = toFiniteNumber(
    (responseHeaders.getContentLength as () => unknown)()
  );
  if (declaredLength != null && declaredLength > ctx.limits.content) {
    throw contentTooLarge(ctx);
  }
};

// Where responses can't stream, the limit is checked on the body once it's read.
export const checkMaterializedSize = (ctx: FetchContext, responseData: unknown): void => {
  if (ctx.limits.content === undefined || responseData == null) return;
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
  if (typeof materializedSize === "number" && materializedSize > ctx.limits.content) {
    throw contentTooLarge(ctx);
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
const throwStagedTypeError = (ctx: FetchContext, err: Error): void => {
  const { config, request, stage, url } = ctx;
  if (stage !== "body" && isUnparseableURL(url)) {
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
const networkErrorMessage = (ctx: FetchContext, cause: unknown): string => {
  const { config, url } = ctx;
  const code = getSafeProp(cause, "code");
  let reason = "";
  if (typeof code === "string" && code) reason = code;
  else if (cause instanceof Error && cause.message) reason = cause.message;
  const method = getSafeProp(config, "method");
  const verb = (typeof method === "string" ? method : "get").toUpperCase();
  const safe = stripUserInfo(url);
  const end = safe.search(/[?#]/);
  const target = ` (${verb} ${end === -1 ? safe : safe.slice(0, end)})`;
  return reason ? `Network Error: ${reason}${target}` : `Network Error${target}`;
};

export const handleFetchCaughtError = (ctx: FetchContext, err: unknown): never => {
  const { config, request, signal: composedSignal } = ctx;
  // Safari can surface fetch aborts as a DOMException-like object whose
  // branded getters throw. Prefer our composed signal reason before reading
  // the caught error, preserving timeout vs cancellation semantics.
  if (
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
  const { pendingBodyError } = ctx;
  if (pendingBodyError) {
    request && !pendingBodyError.request && (pendingBodyError.request = request);
    throw pendingBodyError;
  }

  // Re-throw FaxiosErrors we raised synchronously without re-wrapping them.
  if (err instanceof FaxiosError) {
    request && !err.request && (err.request = request);
    throw err;
  }

  const _err = err as Record<string, unknown> & Error;
  if (_err.name === "TypeError" && ctx.stage) {
    throwStagedTypeError(ctx, _err);
  }
  if (
    _err.name === "TypeError" &&
    /Load failed|fetch/i.test(_err.message)
  ) {
    const cause: unknown = _err["cause"] || _err;
    throw Object.assign(
      new FaxiosError(
        networkErrorMessage(ctx, cause),
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
