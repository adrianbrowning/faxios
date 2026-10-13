// @ts-self-types="./Faxios.d.ts" — required for Deno: index.ts re-exports Faxios
"use strict";

import canceledFromSignal from "../cancel/canceledFromSignal.js";
import cloneConfig from "../helpers/cloneConfig.js";
import validator from "../helpers/validator.js";
import type {
  FaxiosMiddleware,
  FaxiosNext,
  FaxiosPluginArgument,
  FaxiosRequestConfig,
  FaxiosRequestHeaders,
  FaxiosResponse,
  GenericAbortSignal,
  HeadersDefaults,
  InternalFaxiosRequestConfig,
  Method,
  SchemaConfig,
  StringLiteralsOrString
} from "../types.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import utils from "../utils.js";
import assertRequestConfig from "./assertRequestConfig.js";
import assertTimeout from "./assertTimeout.js";
import { createDefinedEndpoint } from "./define.js";
import type { DefineConfig, DefinedEndpoint } from "./define.js";
import dispatchRequest from "./dispatchRequest.js";
import FaxiosError from "./FaxiosError.js";
import FaxiosHeaders from "./FaxiosHeaders.js";
import mergeConfig from "./mergeConfig.js";
import armDeadline from "./requestDeadline.js";
import resolveRequestURL from "./resolveRequestURL.js";
import type { RouteBuilder, RouteConfig } from "./route.js";
import { createRouteBuilder } from "./route.js";

// Every method header group declared on HeadersDefaults. `satisfies` keeps this
// list exhaustive, so a group the types accept can never reach the wire.
const METHOD_HEADER_GROUPS = Object.keys({
  common: true,
  delete: true,
  get: true,
  head: true,
  options: true,
  post: true,
  put: true,
  patch: true,
  purge: true,
  link: true,
  unlink: true,
  query: true,
} satisfies Record<keyof HeadersDefaults, true>) as Array<keyof HeadersDefaults>;

// RFC 9110 token: what fetch accepts as a method name.
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function patchErrorStack(err: Error): void {
  let dummy: { stack?: string; } = {};
  // captureStackTrace is V8-only (Node, Chromium); fall back elsewhere.
  const captureStackTrace = (Error as { captureStackTrace?: (target: object) => void; }).captureStackTrace;
  if (captureStackTrace) {
    captureStackTrace(dummy);
  }
  else {
    dummy = new Error();
  }

  const rawStack = dummy.stack ?? "";
  const firstNewline = rawStack.indexOf("\n");
  // slice off the Error: ... line
  const stack = firstNewline === -1 ? "" : rawStack.slice(firstNewline + 1);

  try {
    if (!err.stack) {
      err.stack = stack;
      // match without the 2 top stack lines
    }
    else if (stack) {
      const firstNewlineIndex = stack.indexOf("\n");
      const secondNewlineIndex =
        firstNewlineIndex === -1
          ? -1
          : stack.indexOf("\n", firstNewlineIndex + 1);
      const stackWithoutTwoTopLines =
        secondNewlineIndex === -1
          ? ""
          : stack.slice(secondNewlineIndex + 1);

      if (!String(err.stack).endsWith(stackWithoutTwoTopLines)) {
        err.stack += "\n" + stack;
      }
    }
  }
  catch {
    // ignore the case where "stack" is an un-writable property
  }
}

function normalizeParamsSerializer(config: FaxiosRequestConfig): void {
  const { paramsSerializer } = config;
  if (paramsSerializer == null) return;

  if (utils.isFunction(paramsSerializer)) {
    config.paramsSerializer = {
      serialize: paramsSerializer as (
        params: Record<string, unknown>
      ) => string,
    };
  }
  else {
    validator.assertOptions(
      paramsSerializer,
      {
        encode: validator.validators.function,
        serialize: validator.validators.function,
      },
      true
    );
  }
}

function resolveAllowAbsoluteUrls(
  config: FaxiosRequestConfig,
  defaults: FaxiosRequestConfig
): void {
  if (config.allowAbsoluteUrls === undefined) {
    // Own reads only: instance defaults may be a plain object (the default instance's are).
    const allowAbsoluteUrls = utils.hasOwnProp(defaults, "allowAbsoluteUrls") ? defaults.allowAbsoluteUrls : undefined;
    const baseURL = utils.hasOwnProp(defaults, "baseURL") ? defaults.baseURL : undefined;
    config.allowAbsoluteUrls = allowAbsoluteUrls ?? !baseURL;
  }
}

// Callers can pass anything at runtime, so a config that isn't an object gets a coded error.
function assertConfigObject(value: unknown): void {
  if (value !== undefined && (value === null || typeof value !== "object")) {
    throw new FaxiosError("config must be an object", FaxiosError.ERR_BAD_OPTION_VALUE);
  }
}

// The request's method, lower-cased. Anything but an HTTP method name gets a coded error.
function resolveMethod(
  config: FaxiosRequestConfig,
  defaults: FaxiosRequestConfig
): string {
  const defaultMethod = utils.hasOwnProp(defaults, "method") ? defaults.method : undefined;
  const method: unknown = config.method || defaultMethod || "get";
  if (typeof method !== "string" || !HTTP_TOKEN.test(method)) {
    throw new FaxiosError("option method must be an HTTP method name", FaxiosError.ERR_BAD_OPTION_VALUE, config as InternalFaxiosRequestConfig);
  }
  return method.toLowerCase();
}

// A URL instance is sent as its href; anything but a string or URL gets a coded error.
function normalizeURL(config: FaxiosRequestConfig): void {
  const url: unknown = config.url;
  if (url instanceof URL) {
    config.url = url.href;
  }
  else if (url !== undefined && typeof url !== "string") {
    throw new FaxiosError("option url must be a string or URL", FaxiosError.ERR_BAD_OPTION_VALUE, config as InternalFaxiosRequestConfig);
  }
}

// The registry is untyped: each entry was checked against its instance's options and capabilities
// when use() accepted it, and the runtime only forwards contexts between entries.
type AnyContextMiddleware = FaxiosMiddleware<unknown, unknown>;
type AnyContextNext = FaxiosNext<unknown, unknown>;

type MiddlewareEntry = {
  // Request option names the plugin declared, accepted in request config while it's installed.
  options: ReadonlyArray<string>;
  provided: Array<string>;
  // The value passed to use(), kept only for eject()'s identity check.
  ref: unknown;
  run: AnyContextMiddleware;
};

function composeMiddleware(entries: ReadonlyArray<MiddlewareEntry>, dispatch: AnyContextNext): AnyContextNext {
  // Plain closures, no async wrapper: a middleware that calls next() before awaiting reaches the
  // adapter in the same tick, exactly as a request without middleware does.
  // Each middleware's result is checked before the one outside it sees it, so a middleware that
  // forgets `return next(ctx)` fails with a coded error instead of crashing the next one out.
  return entries.reduceRight<AnyContextNext>(
    (next, entry) => ctx => Promise.resolve(entry.run(ctx, next)).then(response => checkMiddlewareResponse(response, ctx.config)),
    dispatch
  );
}

function checkMiddlewareResponse(response: unknown, config: InternalFaxiosRequestConfig): FaxiosResponse {
  // Only a missing result is rejected: a middleware may return its own response-shaped object.
  if (utils.isObject(response)) return response as FaxiosResponse;
  throw new FaxiosError(
    "Middleware resolved without a response; did you forget to return next(ctx)?",
    FaxiosError.ERR_BAD_RESPONSE,
    config
  );
}

// Each dispatch works on its own copy, so dispatch's in-place writes (path-param substitution,
// transformRequest, schema output, header normalization) never reach ctx.config, and a middleware
// that calls next() again starts from the same input.
function copyForDispatch(config: InternalFaxiosRequestConfig): InternalFaxiosRequestConfig {
  const copy = cloneConfig(config);
  copy.headers = new FaxiosHeaders(config.headers) as unknown as FaxiosRequestHeaders;
  return copy;
}

// Middleware is caller code that may await anything, so the caller's abort settles the request
// right away instead of waiting for it. Dispatch still checks the signal before the adapter call,
// so nothing is sent after an abort either way. An already-aborted request runs no middleware.
function settleOnAbort(
  run: () => Promise<FaxiosResponse>,
  signal: AbortSignal | GenericAbortSignal,
  config: InternalFaxiosRequestConfig
): Promise<FaxiosResponse> {
  if (signal.aborted) return Promise.reject(canceledFromSignal(signal, config));
  const { addEventListener: add, removeEventListener: remove } = signal;
  if (typeof add !== "function") return run();
  return new Promise((resolve, reject) => {
    const stop = () => remove?.call(signal, "abort", onAbort);
    function onAbort() {
      stop();
      reject(canceledFromSignal(signal, config));
    }
    // Listen before running: middleware may abort the signal before its first await.
    add.call(signal, "abort", onAbort);
    // The executor calls run() right away and turns a synchronous throw into a rejection, which
    // Promise.resolve(run()) wouldn't, and .then(run) would delay dispatch by a tick.
    // eslint-disable-next-line sonarjs/prefer-promise-shorthand -- see above
    const pending = new Promise<FaxiosResponse>(_resolve => {
      _resolve(run());
    });
    // Once the abort has settled the request, this result has nowhere to go; the handlers below
    // still consume it, so it never becomes an unhandled rejection.
    pending.finally(stop).then(resolve)
      .catch(reject);
  });
}

// Runs the request under its signal and `timeout`. The deadline is armed here, before middleware,
// so it covers the whole request: middleware, schemas, every retry try and wait, the fetch and the
// body. Its signal replaces config.signal, so every stage that watches the signal stops at it.
// Without a deadline or middleware, dispatch watches the caller's signal itself. Not async: a
// request without a timeout reaches dispatch in the same tick, as it did before.
function runRequest(run: () => Promise<FaxiosResponse>, config: InternalFaxiosRequestConfig, hasMiddleware: boolean): Promise<FaxiosResponse> {
  const timeout = utils.hasOwnProp(config, "timeout") ? config.timeout : undefined;
  const callerSignal = utils.hasOwnProp(config, "signal") ? config.signal : undefined;
  const ms = timeout == null ? 0 : Number(timeout);
  if (ms <= 0) return callerSignal && hasMiddleware ? settleOnAbort(run, callerSignal, config) : run();
  const deadline = armDeadline(ms, callerSignal, config);
  config.signal = deadline.signal;
  // settleOnAbort never throws, so the deadline is always settled.
  return settleOnAbort(run, deadline.signal, config).finally(deadline.settle);
}

// One level's headers (instance or request), lowest precedence first: the `common` group, the
// group for the request's method, then the top-level headers. Every FaxiosConfigHeaders member is
// a string-keyed object, so the casts are checked widenings, not assertions.
function headerLayers(headers: unknown, method: string): Array<null | Record<string, unknown>> {
  if (!utils.isPlainObject(headers)) return [ headers as null ];
  const h = headers as Record<string, unknown>;
  // A group is an own object under a group name; a string under a group name is a real header.
  const isGroup = (name: string) =>
    METHOD_HEADER_GROUPS.includes(name as keyof HeadersDefaults) && utils.hasOwnProp(h, name) && utils.isObject(h[name]);
  const topLevel: Record<string, unknown> = Object.create(null);
  for (const name of Object.keys(h)) {
    if (!isGroup(name)) topLevel[name] = h[name];
  }
  return [
    isGroup("common") ? h["common"] as Record<string, unknown> : null,
    isGroup(method) ? h[method] as Record<string, unknown> : null,
    topLevel,
  ];
}

// Middleware registration isn't a Faxios member: the callable instance from create() reaches it
// through these, and its FaxiosInstance["use"] is the one place plugins are typed and checked.
// The registry itself is untyped, so the class has nothing to type-check against.
let useMiddleware!: (faxios: Faxios, middleware: AnyContextMiddleware | FaxiosPluginArgument) => void;
let ejectMiddleware!: (faxios: Faxios, middleware: unknown) => void;

/**
 * Create a new instance of Faxios
 *
 * @param {Object} instanceConfig The default config for the instance
 *
 * @return {Faxios} A new instance of Faxios
 */
class Faxios {
  defaults: FaxiosRequestConfig;
  #middleware: ReadonlyArray<MiddlewareEntry> = [];
  // Middleware and capabilities are replaced, never mutated, on use()/eject(): a request keeps the
  // snapshot it started with, and composes nothing per call.
  #composed: AnyContextNext | null = null;
  #capabilities: Record<string, unknown> = Object.create(null);
  // Request options the installed plugins declared; any other unknown config key is rejected.
  #pluginOptions: ReadonlySet<string> = new Set();

  constructor(instanceConfig?: FaxiosRequestConfig) {
    this.defaults = instanceConfig || {};
  }

  static {
    useMiddleware = (faxios, middleware) => {
      faxios.#use(middleware);
    };
    ejectMiddleware = (faxios, middleware) => {
      faxios.#eject(middleware);
    };
  }

  // Middleware runs in registration order before dispatch and in reverse order after it.
  #use(middleware: AnyContextMiddleware | FaxiosPluginArgument): void {
    const plugin = typeof middleware === "function" ? null : middleware;
    // Plugins are caller objects: only their own fields count, so a polluted Object.prototype
    // can't supply middleware or capabilities (THREATMODEL T-R4b).
    const own = <K extends keyof FaxiosPluginArgument>(key: K) =>
      (plugin && utils.hasOwnProp(plugin, key) ? plugin[key] : undefined);
    const run = plugin ? own("middleware") : middleware;
    if (typeof run !== "function") {
      throw new FaxiosError("use() expects a middleware function or a plugin with a middleware function", FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    const name = own("name");
    if (plugin && (typeof name !== "string" || name === "")) {
      throw new FaxiosError("use() expects a plugin's own name to be a non-empty string", FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    const declared = own("options");
    if (declared != null && !utils.isPlainObject(declared)) {
      throw new FaxiosError("use() expects a plugin's own options to be an object of request option names", FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    const options = declared == null ? [] : Object.keys(declared).filter(key => !utils.isDangerousKey(key));
    const provides = own("provides");
    const provided = provides == null ? [] : this.#addCapabilities(String(name), provides);
    this.#setMiddleware([ ...this.#middleware, { ref: middleware, run, provided, options }]);
  }

  // Removes middleware or a plugin registered with use(), by reference. In-flight requests keep
  // the snapshot they started with.
  #eject(middleware: unknown): void {
    const index = this.#middleware.findIndex(entry => entry.ref === middleware);
    if (index === -1) return;
    const capabilities = Object.assign(Object.create(null) as Record<string, unknown>, this.#capabilities);
    for (const key of this.#middleware[index]!.provided) {
      delete capabilities[key];
    }
    this.#capabilities = capabilities;
    this.#setMiddleware(this.#middleware.filter((_, i) => i !== index));
  }

  #setMiddleware(entries: ReadonlyArray<MiddlewareEntry>): void {
    this.#middleware = entries;
    this.#pluginOptions = new Set(entries.flatMap(entry => entry.options));
    this.#composed = entries.length === 0
      ? null
      : composeMiddleware(entries, ctx => dispatchRequest(copyForDispatch(ctx.config)));
  }

  #addCapabilities(pluginName: string, provides: unknown): Array<string> {
    const source = provides as Record<string, unknown>;
    const keys = Object.keys(source).filter(key => !utils.isDangerousKey(key));
    for (const key of keys) {
      if (utils.hasOwnProp(this.#capabilities, key)) {
        throw new FaxiosError(`Plugin "${pluginName}" provides capability "${key}", which another plugin already provides`, FaxiosError.ERR_BAD_OPTION);
      }
    }
    this.#capabilities = Object.assign(Object.create(null) as Record<string, unknown>, this.#capabilities);
    for (const key of keys) {
      this.#capabilities[key] = source[key];
    }
    return keys;
  }

  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */

  async request<O, D = unknown>(config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  async request<T = unknown, R = FaxiosResponse<T>, D = unknown>(configOrUrl: FaxiosRequestConfig<D> | string, config?: FaxiosRequestConfig<D>): Promise<R>;
  async request(
    configOrUrl: FaxiosRequestConfig | string,
    config?: FaxiosRequestConfig
  ) {
    try {
      return await this.#request(configOrUrl, config);
    }
    catch (err) {
      if (err instanceof Error) {
        patchErrorStack(err);
      }

      throw err;
    }
  }

  async #request(
    configOrUrl: FaxiosRequestConfig | string,
    config?: FaxiosRequestConfig
  ): Promise<unknown> {
    /*eslint no-param-reassign:0*/
    // Allow for faxios('example/url'[, config]) a la fetch API
    if (typeof configOrUrl === "string") {
      // `faxios(url, null)` has always meant "no config".
      assertConfigObject(config ?? undefined);
      config = { ...config, url: configOrUrl };
    }
    else {
      assertConfigObject(configOrUrl);
      config = configOrUrl;
    }

    // Headers are flattened per level, so every request header group beats every instance one.
    const instanceHeaders = utils.hasOwnProp(this.defaults, "headers") ? this.defaults.headers : undefined;
    const requestHeaders = utils.hasOwnProp(config, "headers") ? config.headers : undefined;

    config = mergeConfig(this.defaults, config);
    assertRequestConfig(config, this.#pluginOptions);

    normalizeParamsSerializer(config);
    resolveAllowAbsoluteUrls(config, this.defaults);

    config.method = resolveMethod(config, this.defaults);
    normalizeURL(config);

    // Every request header replaces the instance's, including a `null` or `false` there.
    config.headers = FaxiosHeaders.concat(undefined, ...headerLayers(instanceHeaders, config.method))
      .set(FaxiosHeaders.concat(undefined, ...headerLayers(requestHeaders, config.method)), true);

    const internal = config as InternalFaxiosRequestConfig;
    // Before middleware, so a bad value never reaches caller code or a timer that fires at once.
    assertTimeout(utils.hasOwnProp(config, "timeout") ? config.timeout : undefined, internal);

    const composed = this.#composed;
    if (!composed) return runRequest(() => dispatchRequest(internal), internal, false);
    // Built when the run starts, so ctx.config carries the request's signal.
    return runRequest(() => composed({ attempt: 1, config: internal, state: Object.create(null), capabilities: this.#capabilities }), internal, true);
  }
   
  get<O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  get<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  get(url: string, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, {
      method: "get",
      url,
      data: config && utils.hasOwnProp(config, "data") ? config.data : undefined,
    }));
  }
   
  delete<O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  delete<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  delete(url: string, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, {
      method: "delete",
      url,
      data: config && utils.hasOwnProp(config, "data") ? config.data : undefined,
    }));
  }
   
  head<O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  head<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  head(url: string, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, {
      method: "head",
      url,
      data: config && utils.hasOwnProp(config, "data") ? config.data : undefined,
    }));
  }
   
  options<O, D = unknown>(url: string, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  options<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, config?: FaxiosRequestConfig<D>): Promise<R>;
  options(url: string, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, {
      method: "options",
      url,
      data: config && utils.hasOwnProp(config, "data") ? config.data : undefined,
    }));
  }
   
  post<O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  post<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  post(url: string, data?: unknown, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, { method: "post", headers: {}, url, data }));
  }
   
  postForm<O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  postForm<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  postForm(url: string, data?: unknown, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, { method: "post", headers: { "Content-Type": "multipart/form-data" }, url, data }));
  }
   
  put<O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  put<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  put(url: string, data?: unknown, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, { method: "put", headers: {}, url, data }));
  }
   
  putForm<O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  putForm<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  putForm(url: string, data?: unknown, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, { method: "put", headers: { "Content-Type": "multipart/form-data" }, url, data }));
  }
   
  patch<O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  patch<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  patch(url: string, data?: unknown, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, { method: "patch", headers: {}, url, data }));
  }
   
  patchForm<O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  patchForm<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  patchForm(url: string, data?: unknown, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, { method: "patch", headers: { "Content-Type": "multipart/form-data" }, url, data }));
  }
   
  query<O, D = unknown>(url: string, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  query<T = unknown, R = FaxiosResponse<T>, D = unknown>(url: string, data?: D, config?: FaxiosRequestConfig<D>): Promise<R>;
  query(url: string, data?: unknown, config?: FaxiosRequestConfig) {
    return this.request(mergeConfig(config || {}, { method: "query", headers: {}, url, data }));
  }

  getUri(config?: FaxiosRequestConfig) {
    config = mergeConfig(this.defaults, config);
    resolveAllowAbsoluteUrls(config, this.defaults);
    return resolveRequestURL(config);
  }

  define<
    PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined,
    P extends StandardSchemaV1 | undefined = undefined,
    D extends StandardSchemaV1 | undefined = undefined,
    R extends StandardSchemaV1 | undefined = undefined
  >(
    method: StringLiteralsOrString<Method>,
    url: string,
    config?: DefineConfig<PP, P, D, R>
  ): DefinedEndpoint<PP, P, D, R> {
    return createDefinedEndpoint(this, method, url, config);
  }

  route<PP extends StandardSchemaV1<unknown, Record<string, unknown>> | undefined = undefined>(
    url: string,
    config?: RouteConfig<PP>
  ): RouteBuilder<PP> {
    return createRouteBuilder(this, url, config);
  }
}

export { ejectMiddleware, useMiddleware };
export default Faxios;
