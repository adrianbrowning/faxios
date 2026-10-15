"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import stripUserInfo from "../helpers/stripUserInfo.js";
import utf8ByteLength from "../helpers/utf8ByteLength.js";
import type {
  FaxiosResponse,
  InternalFaxiosRequestConfig
} from "../types.js";
import type { WebAbortSignal, WebRequest } from "../types/web.js";
import { getSafeProp, toFiniteNumber } from "../utils.js";

export type ComposedSignal = WebAbortSignal & { unsubscribe?: () => void; };
// The adapter step a failure came from: building the Request, sending it, or reading the body.
export type FetchStage = "body" | "build" | "send";

// The per-request state the adapter's steps share.
export type FetchContext = {
  // A maxBodyLength (or bad chunk) error raised while fetch read the request body stream.
  bodyError: FaxiosError | undefined;
  config: InternalFaxiosRequestConfig;
  // maxContentLength and maxBodyLength; undefined when not set (a negative or non-number value).
  limits: { body: number | undefined; content: number | undefined; };
  method: string;
  // The fetch Request, once built. Undefined before that and where the runtime has no Request.
  request: undefined | WebRequest;
  signal: ComposedSignal;
  stage: FetchStage | undefined;
  url: unknown;
};

// The one place each size-limit error is defined.
export const contentTooLarge = (ctx: FetchContext): FaxiosError =>
  new FaxiosError(
    "maxContentLength size of " + String(ctx.limits.content) + " exceeded",
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

// A HEAD response and these statuses have no body, so their Content-Length isn't what they send.
const BODILESS_STATUSES: ReadonlyArray<number> = [ 204, 205, 304 ];

export const checkDeclaredContentLength = (
  ctx: FetchContext,
  response: { headers: FaxiosHeaders; status: number; }
): void => {
  const limit = ctx.limits.content;
  if (limit === undefined || ctx.method === "head" || BODILESS_STATUSES.includes(response.status)) return;
  const declaredLength = toFiniteNumber(response.headers.getContentLength());
  if (declaredLength != null && declaredLength > limit) {
    throw contentTooLarge(ctx);
  }
};

// The size of a body that was read whole, for a response the counting stream wrapper didn't read:
// a runtime without stream responses, or a Response-like value from `env.fetch` with no stream body.
export const checkMaterializedSize = (ctx: FetchContext, responseData: unknown): void => {
  const limit = ctx.limits.content;
  if (limit === undefined || responseData == null) return;
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
  if (typeof materializedSize === "number" && materializedSize > limit) {
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
const throwStagedTypeError = (err: Error, ctx: FetchContext): void => {
  const { config, request, stage, url } = ctx;
  if (stage !== "body" && typeof url === "string" && isUnparseableURL(url)) {
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
const networkErrorMessage = (cause: unknown, ctx: FetchContext): string => {
  const { config, url } = ctx;
  const code = getSafeProp(cause, "code");
  let reason = "";
  if (typeof code === "string" && code) reason = code;
  else if (cause instanceof Error && cause.message) reason = cause.message;
  const method = getSafeProp(config, "method");
  const verb = (typeof method === "string" ? method : "get").toUpperCase();
  let target = "";
  if (typeof url === "string") {
    const safe = stripUserInfo(url);
    const end = safe.search(/[?#]/);
    target = ` (${verb} ${end === -1 ? safe : safe.slice(0, end)})`;
  }
  return reason ? `Network Error: ${reason}${target}` : `Network Error${target}`;
};

export const handleFetchCaughtError = (err: unknown, ctx: FetchContext): never => {
  const { config, request, signal, stage } = ctx;
  // Safari can surface fetch aborts as a DOMException-like object whose
  // branded getters throw. Prefer our composed signal reason before reading
  // the caught error, preserving timeout vs cancellation semantics.
  if (signal.aborted && signal.reason instanceof FaxiosError) {
    const canceledError = signal.reason;
    canceledError.config = config;
    request && (canceledError.request = request);
    // A cancellation already carries the abort reason as its cause; keep it.
    err !== canceledError && canceledError.cause === undefined && (canceledError.cause = err as Error);
    throw canceledError;
  }

  // Surface a maxBodyLength violation we raised while the request body was
  // being streamed. Matching by identity keeps the error deterministic across
  // runtimes and avoids prototype-pollution reads.
  if (ctx.bodyError) {
    const bodyError = ctx.bodyError;
    request && !bodyError.request && (bodyError.request = request);
    throw bodyError;
  }

  // Re-throw FaxiosErrors we raised synchronously without re-wrapping them.
  if (err instanceof FaxiosError) {
    request && !err.request && (err.request = request);
    throw err;
  }

  const _err = err as Record<string, unknown> & Error;
  if (_err.name === "TypeError" && stage) {
    throwStagedTypeError(_err, ctx);
  }
  // fetch rejecting while sending is a transport failure. Runtimes word it differently (Node's
  // "fetch failed", Bun's ConnectionRefused, Deno's "client error (Connect)"), so the stage
  // decides, not the message.
  if (stage === "send") {
    const cause: unknown = _err["cause"] || _err;
    throw Object.assign(
      new FaxiosError(
        networkErrorMessage(cause, ctx),
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
