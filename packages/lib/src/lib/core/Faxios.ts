// @ts-self-types="./Faxios.d.ts" — required for Deno: index.ts re-exports Faxios
"use strict";

import canceledFromSignal from "../cancel/canceledFromSignal.js";
import cloneConfig from "../helpers/cloneConfig.js";
import raceAbort from "../helpers/raceAbort.js";
import type {
  FaxiosMiddleware,
  FaxiosNext,
  FaxiosPluginArgument,
  FaxiosRequestConfig,
  FaxiosResponse,
  HeadersDefaults,
  InternalFaxiosRequestConfig,
  Method,
  RawFaxiosRequestHeaders,
  ResponseTypedConfig,
  SchemaConfig,
  StringLiteralsOrString
} from "../types.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type { WebURL } from "../types/web.js";
import { hasOwnProp, isDangerousKey, isFunction, isObject, isPlainObject } from "../utils.js";
import assertRequestConfig from "./assertRequestConfig.js";
import assertSignal from "./assertSignal.js";
import assertTimeout from "./assertTimeout.js";
import { createDefinedEndpoint } from "./define.js";
import type { DefineConfig, DefinedEndpoint } from "./define.js";
import dispatchRequest from "./dispatchRequest.js";
import FaxiosError from "./FaxiosError.js";
import FaxiosHeaders from "./FaxiosHeaders.js";
import type { HeaderInput } from "./FaxiosHeaders.js";
import mergeConfig, { mergeConfigExceptHeaders } from "./mergeConfig.js";
import armDeadline, { RequestBodies } from "./requestDeadline.js";
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

// Adds the caller's frames to `rawStack`, the request's error stack. `callerStack` is the stack
// captured where request() rejects, including its "Error" line.
function stitchStack(rawStack: unknown, callerStack: string): unknown {
  const firstNewline = callerStack.indexOf("\n");
  // slice off the Error: ... line
  const stack = firstNewline === -1 ? "" : callerStack.slice(firstNewline + 1);
  if (!rawStack) return stack;
  if (!stack) return rawStack;
  // match without the 2 top stack lines
  const firstNewlineIndex = stack.indexOf("\n");
  const secondNewlineIndex = firstNewlineIndex === -1 ? -1 : stack.indexOf("\n", firstNewlineIndex + 1);
  const stackWithoutTwoTopLines = secondNewlineIndex === -1 ? "" : stack.slice(secondNewlineIndex + 1);
  return String(rawStack).endsWith(stackWithoutTwoTopLines) ? rawStack : rawStack + "\n" + stack;
}

// Formatting a stack is costly, and most rejections are handled without reading it, so the
// caller's frames are captured now and stitched into err.stack only when it is first read.
function patchErrorStack(err: Error): void {
  let callerFrames: { stack?: string; } = {};
  // captureStackTrace is V8-only (Node, Chromium) and formats nothing until .stack is read.
  const captureStackTrace = (Error as { captureStackTrace?: (target: object) => void; }).captureStackTrace;
  if (captureStackTrace) {
    captureStackTrace(callerFrames);
  }
  else {
    callerFrames = new Error();
  }

  // V8 keeps an own accessor that formats on first read; elsewhere `stack` may be an own string
  // or an accessor on Error.prototype.
  const own = Object.getOwnPropertyDescriptor(err, "stack");
  if (own && !own.configurable) return;
  const readOriginal = (): unknown => {
    if (!own) return Reflect.get(Object.getPrototypeOf(err) ?? {}, "stack", err);
    return own.get ? own.get.call(err) : own.value;
  };
  const settle = (value: unknown): void => {
    Object.defineProperty(err, "stack", { value, writable: true, enumerable: own?.enumerable ?? false, configurable: true });
  };
  Object.defineProperty(err, "stack", {
    get() {
      const value = stitchStack(readOriginal(), callerFrames.stack ?? "");
      settle(value);
      return value;
    },
    set: settle,
    enumerable: own?.enumerable ?? false,
    configurable: true,
  });
}

// assertRequestConfig has checked an object paramsSerializer; a function one is its serialize option.
function normalizeParamsSerializer(config: FaxiosRequestConfig): void {
  const { paramsSerializer } = config;
  if (isFunction(paramsSerializer)) {
    config.paramsSerializer = {
      serialize: paramsSerializer as (
        params: Record<string, unknown>
      ) => string,
    };
  }
}

function resolveAllowAbsoluteUrls(
  config: FaxiosRequestConfig,
  defaults: FaxiosRequestConfig
): void {
  if (config.allowAbsoluteUrls === undefined) {
    // Own reads only: instance defaults may be a plain object (the default instance's are).
    const allowAbsoluteUrls = hasOwnProp(defaults, "allowAbsoluteUrls") ? defaults.allowAbsoluteUrls : undefined;
    const baseURL = hasOwnProp(defaults, "baseURL") ? defaults.baseURL : undefined;
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
  const defaultMethod = hasOwnProp(defaults, "method") ? defaults.method : undefined;
  // Only an absent (undefined or null) method falls back; '', 0 or false is rejected.
  const method: unknown = config.method ?? defaultMethod ?? "get";
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
  if (isObject(response)) return response as FaxiosResponse;
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
  copy.headers = new FaxiosHeaders(config.headers);
  return copy;
}

// The stream bodies of each request with middleware, by its ctx.state: every middleware passes the
// state on with the context, so the dispatch at the end of the chain finds the request it serves.
const bodiesByState = new WeakMap<object, RequestBodies>();

// Runs the request under its signal and `timeout`. The deadline is armed here, before middleware,
// so it covers the whole request: middleware, schemas, every retry try and wait, the fetch and the
// body. Its signal replaces config.signal, so every stage that watches the signal stops at it.
// Middleware is caller code that may await anything, so an abort settles the request right away
// instead of waiting for it; dispatch still checks the signal before the adapter call, so nothing
// is sent after an abort either way, and an already-aborted request runs no middleware. A stream
// body the request opened stays under its signal until the body ends, and only then is the
// deadline settled; when the abort won the race, the body is aborted at once.
// Without a deadline or middleware, dispatch watches the caller's signal itself. Not async: a
// request reaches dispatch in the same tick.
function runRequest(run: (bodies?: RequestBodies) => Promise<FaxiosResponse>, config: InternalFaxiosRequestConfig, hasMiddleware: boolean): Promise<FaxiosResponse> {
  const timeout = hasOwnProp(config, "timeout") ? config.timeout : undefined;
  const callerSignal = hasOwnProp(config, "signal") ? config.signal : undefined;
  const ms = timeout == null ? 0 : Number(timeout);
  if (ms <= 0 && (!callerSignal || !hasMiddleware)) return run();
  const deadline = ms > 0 ? armDeadline(ms, callerSignal, config) : undefined;
  const signal = deadline ? deadline.signal : callerSignal!;
  config.signal = signal;
  const bodies = new RequestBodies(signal, config, deadline ? deadline.settle : () => {});
  return raceAbort(signal, () => run(bodies), () => canceledFromSignal(signal, config))
    .finally(() => bodies.release());
}

// A group is an own object under a group name; a string under a group name is a real header.
function isHeaderGroup(headers: Record<string, unknown>, name: string): boolean {
  return METHOD_HEADER_GROUPS.includes(name as keyof HeadersDefaults) && hasOwnProp(headers, name) && isObject(headers[name]);
}

// One level's headers (instance or request), lowest precedence first: the `common` group, the
// group for the request's method, then the top-level headers. A FaxiosHeaders, Headers or other
// iterable is one layer as it is. The config was validated as FaxiosConfigHeaders, so the casts
// name what each layer holds.
function headerLayers(headers: unknown, method: string): Array<HeaderInput> {
  if (!isPlainObject(headers)) return [ headers as HeaderInput ];
  const h = headers as Record<string, unknown>;
  const topLevel: Record<string, unknown> = Object.create(null);
  for (const name of Object.keys(h)) {
    if (!isHeaderGroup(h, name)) topLevel[name] = h[name];
  }
  return [
    isHeaderGroup(h, "common") ? h["common"] as HeaderInput : null,
    isHeaderGroup(h, method) ? h[method] as HeaderInput : null,
    topLevel as HeaderInput,
  ];
}

// Removes every own key of `layer` that names `header`, case-insensitively.
function deleteHeader(layer: Record<string, unknown> | undefined, header: string): void {
  if (!layer) return;
  for (const key of Object.keys(layer)) {
    if (key.toLowerCase() === header) delete layer[key];
  }
}

// A child method group beats the parent for that method only. A parent top-level value beat the
// parent's groups, so it moves to `common`, where the child group beats it. A plain header
// literally named `common` leaves no room for the group, so the parent's then stays.
function yieldToChildGroup(
  top: Record<string, unknown>,
  groups: Partial<Record<keyof HeadersDefaults, Record<string, unknown>>>,
  method: keyof HeadersDefaults,
  header: string,
  deleteEverywhere: (header: string) => void
): void {
  const topKey = Object.keys(top).findLast(key => key.toLowerCase() === header);
  if (topKey !== undefined && !hasOwnProp(top, "common")) {
    const value = top[topKey];
    deleteEverywhere(header);
    groups.common ??= Object.create(null) as Record<string, unknown>;
    groups.common[topKey] = value;
  }
  deleteHeader(groups[method], header);
}

// Own string keys of a caller's header group in a null-prototype object, skipping the keys that
// could pollute a prototype. Never Object.assign: it runs getters and copies symbols.
function ownHeaderCopy(source: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(source)) {
    if (!isDangerousKey(key)) copy[key] = source[key];
  }
  return copy;
}

/**
 * The parent's headers for a create() child, with every header the child sets removed from the
 * parent layers it must beat. Deep-merging the result with the child's headers then gives each
 * method the headers request() would send for the same layers: any child layer, `common`
 * included, beats every parent layer, and a child method group applies to that method only.
 */
function inheritHeaders(parentHeaders: unknown, childHeaders: unknown): unknown {
  const parent = parentHeaders instanceof FaxiosHeaders ? { ...parentHeaders } : parentHeaders;
  const child = childHeaders instanceof FaxiosHeaders ? { ...childHeaders } : childHeaders;
  if (!isPlainObject(parent) || !isPlainObject(child)) return parentHeaders;
  const p = parent as Record<string, unknown>;
  const c = child as Record<string, unknown>;
  const top: Record<string, unknown> = Object.create(null);
  const groups: Partial<Record<keyof HeadersDefaults, Record<string, unknown>>> = Object.create(null);
  // A caller object: own string keys only, skipping the ones that could pollute a prototype.
  for (const name of Object.keys(p)) {
    if (isHeaderGroup(p, name)) groups[name as keyof HeadersDefaults] = ownHeaderCopy(p[name] as Record<string, unknown>);
    else if (!isDangerousKey(name)) top[name] = p[name];
  }
  const deleteEverywhere = (header: string) => {
    deleteHeader(top, header);
    for (const group of Object.values(groups)) deleteHeader(group, header);
  };
  const everyMethod = [ ...Object.keys(c).filter(name => !isHeaderGroup(c, name)), ...isHeaderGroup(c, "common") ? Object.keys(c["common"] as object) : [] ];
  // Child top-level and `common` headers apply to every method, so they replace every parent layer.
  for (const name of everyMethod) deleteEverywhere(name.toLowerCase());
  for (const method of METHOD_HEADER_GROUPS) {
    if (method === "common" || !isHeaderGroup(c, method)) continue;
    for (const name of Object.keys(c[method] as object)) {
      yieldToChildGroup(top, groups, method, name.toLowerCase(), deleteEverywhere);
    }
  }
  return Object.assign(Object.create(null) as Record<string, unknown>, top, groups);
}

// Middleware registration isn't a Faxios member: the callable instance from create() reaches it
// through these, and its FaxiosInstance["use"] is the one place plugins are typed and checked.
// The registry itself is untyped, so the class has nothing to type-check against.
let useMiddleware!: (faxios: Faxios, middleware: AnyContextMiddleware | FaxiosPluginArgument) => void;
let ejectMiddleware!: (faxios: Faxios, middleware: unknown) => void;
let childDefaults!: (faxios: Faxios, instanceConfig: FaxiosRequestConfig | undefined) => FaxiosRequestConfig;

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
    // A child has none of the parent's middleware, so the parent's plugin option defaults would
    // reject every child request. They are dropped; the child's headers beat every parent layer.
    childDefaults = (faxios, instanceConfig) => {
      const inherited: Record<string, unknown> = { ...faxios.defaults };
      for (const key of faxios.#pluginOptions) delete inherited[key];
      const childHeaders = instanceConfig && hasOwnProp(instanceConfig, "headers") ? instanceConfig.headers : undefined;
      if (hasOwnProp(inherited, "headers")) inherited["headers"] = inheritHeaders(inherited["headers"], childHeaders);
      return mergeConfig(inherited, instanceConfig);
    };
  }

  // Middleware runs in registration order before dispatch and in reverse order after it.
  #use(middleware: AnyContextMiddleware | FaxiosPluginArgument): void {
    const plugin = typeof middleware === "function" ? null : middleware;
    // Plugins are caller objects: only their own fields count, so a polluted Object.prototype
    // can't supply middleware or capabilities (THREATMODEL T-R4b).
    const own = <K extends keyof FaxiosPluginArgument>(key: K) =>
      (plugin && hasOwnProp(plugin, key) ? plugin[key] : undefined);
    const run = plugin ? own("middleware") : middleware;
    if (typeof run !== "function") {
      throw new FaxiosError("use() expects a middleware function or a plugin with a middleware function", FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    const name = own("name");
    if (plugin && (typeof name !== "string" || name === "")) {
      throw new FaxiosError("use() expects a plugin's own name to be a non-empty string", FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    const declared = own("options");
    if (declared != null && !isPlainObject(declared)) {
      throw new FaxiosError("use() expects a plugin's own options to be an object of request option names", FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    const options = declared == null ? [] : Object.keys(declared).filter(key => !isDangerousKey(key));
    const provides = own("provides");
    const capabilities = provides == null ? null : this.#withCapabilities(String(name), provides);
    this.#setMiddleware([ ...this.#middleware, { ref: middleware, run, provided: capabilities ? capabilities.keys : [], options }]);
    if (capabilities) this.#capabilities = capabilities.next;
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
    const removed = this.#middleware[index]!.options;
    this.#setMiddleware(this.#middleware.filter((_, i) => i !== index));
    // A default for an option no remaining plugin declares would reject every later request.
    const defaults = this.defaults as Record<string, unknown>;
    for (const key of removed) {
      if (!this.#pluginOptions.has(key)) delete defaults[key];
    }
  }

  #setMiddleware(entries: ReadonlyArray<MiddlewareEntry>): void {
    this.#middleware = entries;
    this.#pluginOptions = new Set(entries.flatMap(entry => entry.options));
    this.#composed = entries.length === 0
      ? null
      : composeMiddleware(entries, ctx => dispatchRequest(copyForDispatch(ctx.config), bodiesByState.get(ctx.state)));
  }

  // Reads every caller-supplied capability into a new snapshot without touching instance state,
  // so a throwing getter or a collision leaves the instance as it was.
  #withCapabilities(pluginName: string, provides: unknown): { keys: Array<string>; next: Record<string, unknown>; } {
    const source = provides as Record<string, unknown>;
    const keys = Object.keys(source).filter(key => !isDangerousKey(key));
    for (const key of keys) {
      if (hasOwnProp(this.#capabilities, key)) {
        throw new FaxiosError(`Plugin "${pluginName}" provides capability "${key}", which another plugin already provides`, FaxiosError.ERR_BAD_OPTION);
      }
    }
    const next = Object.assign(Object.create(null) as Record<string, unknown>, this.#capabilities);
    for (const key of keys) {
      next[key] = source[key];
    }
    return { keys, next };
  }

  /**
   * Send a request: `request(config)`, or `request(url, config)` with a string or `URL` url. The
   * config is merged with this.defaults.
   */
  async request<O, D = unknown>(config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  async request<O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  async request<T = unknown, D = unknown>(configOrUrl: ResponseTypedConfig<T, D> | string | WebURL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  async request(
    configOrUrl: FaxiosRequestConfig | string | WebURL,
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
    configOrUrl: FaxiosRequestConfig | string | WebURL,
    config?: FaxiosRequestConfig
  ): Promise<unknown> {
    /*eslint no-param-reassign:0*/
    // Allow for faxios('example/url'[, config]) a la fetch API
    if (typeof configOrUrl === "string" || configOrUrl instanceof URL) {
      // `faxios(url, null)` has always meant "no config".
      assertConfigObject(config ?? undefined);
      config = { ...config, url: configOrUrl };
    }
    else {
      assertConfigObject(configOrUrl);
      config = configOrUrl;
    }

    // Headers are flattened per level, so every request header group beats every instance one.
    const instanceHeaders = hasOwnProp(this.defaults, "headers") ? this.defaults.headers : undefined;
    const requestHeaders = hasOwnProp(config, "headers") ? config.headers : undefined;

    config = this.#mergeAndNormalize(config);
    config.method = resolveMethod(config, this.defaults);

    // Every request header replaces the instance's, including a `null` or `false` there.
    config.headers = FaxiosHeaders.concat(undefined, ...headerLayers(instanceHeaders, config.method))
      .set(FaxiosHeaders.concat(undefined, ...headerLayers(requestHeaders, config.method)), true);

    const internal = config as InternalFaxiosRequestConfig;
    // Before middleware, so a bad value never reaches caller code or a timer that fires at once.
    assertTimeout(hasOwnProp(config, "timeout") ? config.timeout : undefined, internal);
    assertSignal(hasOwnProp(config, "signal") ? config.signal : undefined, internal);

    const composed = this.#composed;
    if (!composed) return runRequest(bodies => dispatchRequest(internal, bodies), internal, false);
    const defaultBaseURL = hasOwnProp(this.defaults, "baseURL") ? this.defaults.baseURL : undefined;
    const instanceBaseURL = typeof defaultBaseURL === "string" ? defaultBaseURL : undefined;
    // Built when the run starts, so ctx.config carries the request's signal.
    return runRequest(bodies => {
      const state: Record<string, unknown> = Object.create(null);
      if (bodies) bodiesByState.set(state, bodies);
      return composed({ attempt: 1, config: internal, instanceBaseURL, state, capabilities: this.#capabilities });
    }, internal, true);
  }

  get<O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  get<T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  get(url: string | WebURL, config?: FaxiosRequestConfig) {
    return this.#alias("get", url, config);
  }

  delete<O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  delete<T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  delete(url: string | WebURL, config?: FaxiosRequestConfig) {
    return this.#alias("delete", url, config);
  }

  head<O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  head<T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  head(url: string | WebURL, config?: FaxiosRequestConfig) {
    return this.#alias("head", url, config);
  }

  options<O, D = unknown>(url: string | WebURL, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  options<T = unknown, D = unknown>(url: string | WebURL, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  options(url: string | WebURL, config?: FaxiosRequestConfig) {
    return this.#alias("options", url, config);
  }

  post<O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  post<T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  post(url: string | WebURL, data?: unknown, config?: FaxiosRequestConfig) {
    return this.#alias("post", url, config, { data, headers: {} });
  }

  postForm<O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  postForm<T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  postForm(url: string | WebURL, data?: unknown, config?: FaxiosRequestConfig) {
    return this.#alias("post", url, config, { data, headers: { "Content-Type": "multipart/form-data" } });
  }

  put<O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  put<T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  put(url: string | WebURL, data?: unknown, config?: FaxiosRequestConfig) {
    return this.#alias("put", url, config, { data, headers: {} });
  }

  putForm<O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  putForm<T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  putForm(url: string | WebURL, data?: unknown, config?: FaxiosRequestConfig) {
    return this.#alias("put", url, config, { data, headers: { "Content-Type": "multipart/form-data" } });
  }

  patch<O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  patch<T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  patch(url: string | WebURL, data?: unknown, config?: FaxiosRequestConfig) {
    return this.#alias("patch", url, config, { data, headers: {} });
  }

  patchForm<O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  patchForm<T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  patchForm(url: string | WebURL, data?: unknown, config?: FaxiosRequestConfig) {
    return this.#alias("patch", url, config, { data, headers: { "Content-Type": "multipart/form-data" } });
  }

  query<O, D = unknown>(url: string | WebURL, data: D | undefined, config: SchemaConfig<O, D>): Promise<FaxiosResponse<O, D>>;
  query<T = unknown, D = unknown>(url: string | WebURL, data?: D, config?: ResponseTypedConfig<T, D>): Promise<FaxiosResponse<T, D>>;
  query(url: string | WebURL, data?: unknown, config?: FaxiosRequestConfig) {
    return this.#alias("query", url, config, { data, headers: {} });
  }

  // The merge-and-dispatch step every method alias shares. A bodyless alias sends the config's own
  // `data`; a body alias sends its `data` argument, with its `headers` merged over the config's.
  #alias(
    method: string,
    url: string | WebURL,
    config: FaxiosRequestConfig | undefined,
    body?: { data: unknown; headers: RawFaxiosRequestHeaders; }
  ): Promise<unknown> {
    const aliasConfig = body ?? { data: config && hasOwnProp(config, "data") ? config.data : undefined };
    return this.request(mergeConfig(config || {}, { ...aliasConfig, method, url }));
  }

  getUri(config?: FaxiosRequestConfig) {
    return resolveRequestURL(this.#mergeAndNormalize(config));
  }

  // The one normalization step request() and getUri() share before resolveRequestURL, so both
  // validate and resolve the same URL. Headers are left out: request() layers them per method.
  #mergeAndNormalize(config: FaxiosRequestConfig | undefined): FaxiosRequestConfig {
    const merged = mergeConfigExceptHeaders(this.defaults, config);
    assertRequestConfig(merged, this.#pluginOptions);
    normalizeParamsSerializer(merged);
    resolveAllowAbsoluteUrls(merged, this.defaults);
    normalizeURL(merged);
    return merged;
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

export { childDefaults, ejectMiddleware, useMiddleware };
export default Faxios;
