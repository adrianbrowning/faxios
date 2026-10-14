// @ts-self-types="./web.d.ts"
/**
 * The web-platform types faxios's declarations mention, without the DOM lib or @types/node.
 *
 * Each `Web*` type is the consumer's own global type when its lib (DOM) or @types/node declares
 * one, so a DOM or Node project sees the real `Request`, `URL` or `RequestInit`. A project with
 * neither gets the minimal `*Shim` shape below instead of a TS2304 "Cannot find name" error.
 * The lib itself builds against these shims only (see `web-globals.d.ts`), so a declaration that
 * uses a DOM-only name fails the build.
 */
// `x?: T | undefined` is not redundant for a consumer with `exactOptionalPropertyTypes`.
/* eslint-disable sonarjs/no-redundant-optional -- see above */

// The instance type of the global class `K` (read off its `prototype`), or `Shim` without one.
type GlobalInstance<K extends string, Shim> = typeof globalThis extends Record<K, { prototype: infer T; }> ? T : Shim;

export interface AbortSignalShim {
  readonly aborted: boolean;
  addEventListener: (type: "abort", listener: () => void, options?: { once?: boolean; }) => void;
  readonly reason: unknown;
  removeEventListener: (type: "abort", listener: () => void) => void;
  throwIfAborted: () => void;
}

export interface BlobShim {
  arrayBuffer: () => Promise<ArrayBuffer>;
  readonly size: number;
  text: () => Promise<string>;
  readonly type: string;
}

export interface ReadableStreamShim {
  cancel: (reason?: unknown) => Promise<void>;
  getReader: () => {
    cancel: (reason?: unknown) => Promise<void>;
    read: () => Promise<{ done: false; value: Uint8Array; } | { done: true; value?: undefined; }>;
    releaseLock: () => void;
  };
  readonly locked: boolean;
}

export interface HeadersShim {
  [Symbol.iterator]: () => IterableIterator<[string, string]>;
  forEach: (callback: (value: string, name: string) => void) => void;
  get: (name: string) => null | string;
  has: (name: string) => boolean;
  set: (name: string, value: string) => void;
}

export interface FormDataShim {
  [Symbol.iterator]: () => IterableIterator<[string, unknown]>;
  append: (name: string, value: unknown, fileName?: string) => void;
  entries: () => IterableIterator<[string, unknown]>;
  forEach: (callback: (value: unknown, key: string) => void) => void;
}

export interface URLSearchParamsShim {
  [Symbol.iterator]: () => IterableIterator<[string, string]>;
  append: (name: string, value: string) => void;
  forEach: (callback: (value: string, key: string) => void) => void;
  toString: () => string;
}

export interface URLShim {
  hash: string;
  host: string;
  hostname: string;
  href: string;
  readonly origin: string;
  password: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
  readonly searchParams: URLSearchParamsShim;
  toString: () => string;
  username: string;
}

/** The standard `fetch()` init keys faxios's `fetchOptions` checks, as in the Fetch Standard. */
export interface RequestInitShim {
  body?: BodyInitShim | null | undefined;
  cache?: "default" | "force-cache" | "no-cache" | "no-store" | "only-if-cached" | "reload" | undefined;
  credentials?: "include" | "omit" | "same-origin" | undefined;
  duplex?: "half" | undefined;
  headers?: Array<[string, string]> | HeadersShim | Record<string, string> | undefined;
  integrity?: string | undefined;
  keepalive?: boolean | undefined;
  method?: string | undefined;
  mode?: "cors" | "navigate" | "no-cors" | "same-origin" | undefined;
  priority?: "auto" | "high" | "low" | undefined;
  redirect?: "error" | "follow" | "manual" | undefined;
  referrer?: string | undefined;
  referrerPolicy?:
    | ""
    | "no-referrer"
    | "no-referrer-when-downgrade"
    | "origin"
    | "origin-when-cross-origin"
    | "same-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin"
    | "unsafe-url"
    | undefined;
  signal?: AbortSignalShim | null | undefined;
}

export interface ResponseInitShim {
  headers?: Array<[string, string]> | HeadersShim | Record<string, string> | undefined;
  status?: number | undefined;
  statusText?: string | undefined;
}

export type BodyInitShim = ArrayBuffer | ArrayBufferView | BlobShim | FormDataShim | ReadableStreamShim | string | URLSearchParamsShim;

interface BodyShim {
  arrayBuffer: () => Promise<ArrayBuffer>;
  blob: () => Promise<BlobShim>;
  readonly body: null | ReadableStreamShim;
  readonly bodyUsed: boolean;
  formData: () => Promise<FormDataShim>;
  readonly headers: HeadersShim;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export interface RequestShim extends BodyShim {
  clone: () => RequestShim;
  readonly method: string;
  readonly signal: AbortSignalShim;
  readonly url: string;
}

export interface ResponseShim extends BodyShim {
  clone: () => ResponseShim;
  readonly ok: boolean;
  readonly redirected: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly type: string;
  readonly url: string;
}

export interface EventShim {
  readonly type: string;
}

export type WebAbortSignal = GlobalInstance<"AbortSignal", AbortSignalShim>;
export type WebBlob = GlobalInstance<"Blob", BlobShim>;
export type WebEvent = GlobalInstance<"Event", EventShim>;
export type WebFormData = GlobalInstance<"FormData", FormDataShim>;
export type WebHeaders = GlobalInstance<"Headers", HeadersShim>;
export type WebReadableStream = GlobalInstance<"ReadableStream", ReadableStreamShim>;
export type WebRequest = GlobalInstance<"Request", RequestShim>;
export type WebResponse = GlobalInstance<"Response", ResponseShim>;
export type WebURL = GlobalInstance<"URL", URLShim>;
export type WebURLSearchParams = GlobalInstance<"URLSearchParams", URLSearchParamsShim>;

// The patterns below take every parameter as required, so a global whose parameter is required
// (Node's `Blob` takes `sources`) matches as well as one whose parameter is optional.

/** The second parameter of the global `fetch`. */
export type WebRequestInit = typeof globalThis extends { fetch: (input: never, init: infer I) => unknown; } ? NonNullable<I> : RequestInitShim;

/** The parameters of the global `Response` constructor. */
export type WebBodyInit = typeof globalThis extends { Response: new (body: infer B, init: never) => unknown; } ? B : BodyInitShim | null | undefined;
export type WebResponseInit = typeof globalThis extends { Response: new (body: never, init: infer I) => unknown; } ? NonNullable<I> : ResponseInitShim;

/** A part the global `Blob` constructor takes. */
export type WebBlobPart = typeof globalThis extends { Blob: new (parts: Array<infer P>, options: never) => unknown; } ? P : ArrayBuffer | ArrayBufferView | BlobShim | string;

export interface AbortControllerShim {
  abort: (reason?: unknown) => void;
  readonly signal: AbortSignalShim;
}

export interface TextEncoderShim {
  encode: (input?: string) => Uint8Array;
}

/**
 * The web-platform globals the lib calls at runtime, as `web-globals.d.ts` declares them for the
 * build. Internal: never part of a public signature.
 */
export interface BuildGlobalsShim {
  AbortController: { prototype: AbortControllerShim; new (): AbortControllerShim; };
  AbortSignal: {
    any: (signals: Array<AbortSignalShim>) => AbortSignalShim;
    prototype: AbortSignalShim;
    timeout: (milliseconds: number) => AbortSignalShim;
  };
  Blob: { prototype: BlobShim; new (parts?: Array<ArrayBuffer | ArrayBufferView | BlobShim | string>, options?: { type?: string; }): BlobShim; };
  clearTimeout: (id: unknown) => void;
  fetch: (input: RequestShim | string | URLShim, init?: RequestInitShim) => Promise<ResponseShim>;
  FormData: { prototype: FormDataShim; new (): FormDataShim; };
  Headers: { prototype: HeadersShim; new (init?: RequestInitShim["headers"]): HeadersShim; };
  performance: { now: () => number; };
  queueMicrotask: (callback: () => void) => void;
  ReadableStream: {
    prototype: ReadableStreamShim;
    new (source?: unknown, strategy?: unknown): ReadableStreamShim;
    from?: (iterable: AsyncIterable<unknown> | Iterable<unknown>) => ReadableStreamShim;
  };
  Request: { prototype: RequestShim; new (input: RequestShim | string | URLShim, init?: RequestInitShim): RequestShim; };
  Response: { prototype: ResponseShim; new (body?: BodyInitShim | null, init?: ResponseInitShim): ResponseShim; };
  setTimeout: (callback: () => void, milliseconds?: number) => unknown;
  TextEncoder: { prototype: TextEncoderShim; new (): TextEncoderShim; };
  URL: {
    prototype: URLShim;
    new (url: string | URLShim, base?: string | URLShim): URLShim;
    canParse?: (url: string, base?: string) => boolean;
  };
  URLSearchParams: {
    prototype: URLSearchParamsShim;
    new (init?: Array<[string, string]> | Record<string, string> | string | URLSearchParamsShim): URLSearchParamsShim;
  };
}
