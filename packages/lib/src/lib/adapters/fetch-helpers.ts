"use strict";

import FaxiosError from "../core/FaxiosError.js";
import type FaxiosHeaders from "../core/FaxiosHeaders.js";
import stripUserInfo from "../helpers/stripUserInfo.js";
import type {
  FaxiosResponse,
  InternalFaxiosRequestConfig
} from "../types.js";
import type { WebAbortSignal, WebRequest } from "../types/web.js";
import { getSafeProp } from "../utils.js";

export type ComposedSignal = WebAbortSignal & { unsubscribe?: () => void; };
// The adapter step a failure came from: building the Request, sending it, or reading the body.
export type FetchStage = "body" | "build" | "send";

export type AnyConstructor = new (...args: Array<unknown>) => unknown;
export type AnyResponse = {
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

// What the runtime's fetch side supports. Feature detection depends only on the Request and
// Response constructors, so one record serves every `env.fetch`.
export type FetchRuntime = {
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
export type FetchContext = {
  // A maxBodyLength (or bad chunk) error raised while fetch read the request body stream.
  bodyError: FaxiosError | undefined;
  config: InternalFaxiosRequestConfig;
  headers: FaxiosHeaders;
  // maxContentLength and maxBodyLength; undefined when not set (a negative or non-number value).
  limits: { body: number | undefined; content: number | undefined; };
  method: string;
  onDownloadProgress: unknown;
  // Browsers can't be given a stream body for upload progress: Chromium sends one only over
  // HTTP/2 or later and WebKit not at all, so the upload would fail. onUploadProgress isn't
  // called there (#209), so it is undefined.
  onUploadProgress: unknown;
  // The fetch Request, once built. Undefined before that and where the runtime has no Request.
  request: undefined | WebRequest;
  runtime: FetchRuntime;
  // GET and HEAD send no body.
  sendsBody: boolean;
  signal: ComposedSignal;
  stage: FetchStage | undefined;
  // `responseType: "stream"` where the runtime has stream responses.
  streamsResponse: boolean;
  url: unknown;
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
