"use strict";

import transitionalDefaults from "../defaults/transitional.js";
import buildURL from "../helpers/buildURL.js";
import cloneConfig, { DANGEROUS_KEYS } from "../helpers/cloneConfig.js";
import validator from "../helpers/validator.js";
import type { ValidatorFn } from "../helpers/validator.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type {
  FaxiosContext,
  FaxiosMiddleware,
  FaxiosNext,
  FaxiosPlugin,
  FaxiosRequestConfig,
  FaxiosRequestHeaders,
  FaxiosResponse,
  HeadersDefaults,
  InternalFaxiosRequestConfig,
  Method,
  SchemaConfig,
  StringLiteralsOrString
} from "../types.js";
import utils from "../utils.js";
import buildFullPath from "./buildFullPath.js";
import { createDefinedEndpoint } from "./define.js";
import type { DefineConfig, DefinedEndpoint } from "./define.js";
import dispatchRequest from "./dispatchRequest.js";
import FaxiosError from "./FaxiosError.js";
import FaxiosHeaders from "./FaxiosHeaders.js";
import InterceptorManager from "./InterceptorManager.js";
import mergeConfig from "./mergeConfig.js";
import type { RouteConfig, RouteBuilder } from "./route.js";
import { createRouteBuilder } from "./route.js";

type TransitionalFn = (
  validator: ValidatorFn | false | undefined,
  version?: string,
  message?: string
) => ValidatorFn;
type SpellingFn = (correctSpelling: string) => ValidatorFn;
const validators = validator.validators as Record<
  string,
  ValidatorFn | undefined
> & {
  transitional?: TransitionalFn;
  spelling?: SpellingFn;
};

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

type RequestInterceptorEntry = {
  runWhen?: ((c: InternalFaxiosRequestConfig) => boolean) | null;
  synchronous?: boolean;
  fulfilled?: (...args: Array<unknown>) => unknown;
  rejected?: (...args: Array<unknown>) => unknown;
};

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
        encode: validators.function!,
        serialize: validators.function!,
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
    config.allowAbsoluteUrls = defaults.allowAbsoluteUrls ?? !defaults.baseURL;
  }
}

function buildRequestInterceptorChain(
  interceptors: { forEach: (fn: (h: RequestInterceptorEntry) => void) => void; },
  config: FaxiosRequestConfig
): {
  chain: Array<((...args: Array<unknown>) => unknown) | undefined>;
  synchronous: boolean;
} {
  const chain: Array<((...args: Array<unknown>) => unknown) | undefined> = [];
  let synchronous = true;

  interceptors.forEach((interceptor: RequestInterceptorEntry) => {
    if (
      typeof interceptor.runWhen === "function" &&
      interceptor.runWhen(config as InternalFaxiosRequestConfig) === false
    ) {
      return;
    }

    synchronous = synchronous && !!interceptor.synchronous;

    const transitional = config.transitional || transitionalDefaults;
    const legacyInterceptorReqResOrdering =
      transitional.legacyInterceptorReqResOrdering;

    if (legacyInterceptorReqResOrdering) {
      chain.unshift(interceptor.fulfilled, interceptor.rejected);
    }
    else {
      chain.push(interceptor.fulfilled, interceptor.rejected);
    }
  });

  return { chain, synchronous };
}

function runSyncInterceptors(
  interceptorChain: Array<((...args: Array<unknown>) => unknown) | undefined>,
  config: FaxiosRequestConfig,
  context: unknown
): FaxiosRequestConfig {
  let newConfig = config;
  let i = 0;
  const len = interceptorChain.length;

  while (i < len) {
    const onFulfilled = interceptorChain[i++];
    const onRejected = interceptorChain[i++];
    try {
      newConfig = onFulfilled
        ? (onFulfilled(newConfig) as FaxiosRequestConfig)
        : newConfig;
    }
    catch (error) {
      if (onRejected) onRejected.call(context, error);
      break;
    }
  }

  return newConfig;
}

type MiddlewareEntry = {
  // The value passed to use(), kept only for eject()'s identity check.
  ref: unknown;
  run: FaxiosMiddleware;
  provided: Array<string>;
};

function composeMiddleware(entries: ReadonlyArray<MiddlewareEntry>, dispatch: FaxiosNext): FaxiosNext {
  // Plain closures, no async wrapper: a middleware that calls next() before awaiting reaches the
  // adapter in the same tick, exactly as a request without middleware does.
  return entries.reduceRight<FaxiosNext>((next, entry) => ctx => entry.run(ctx, next), dispatch);
}

// Each dispatch works on its own copy, so dispatch's in-place writes (path-param substitution,
// transformRequest, schema output, header normalization) never reach ctx.config, and a middleware
// that calls next() again starts from the same input.
function copyForDispatch(config: InternalFaxiosRequestConfig): InternalFaxiosRequestConfig {
  const copy = cloneConfig(config);
  copy.headers = new FaxiosHeaders(config.headers) as unknown as FaxiosRequestHeaders;
  return copy;
}

/**
 * Create a new instance of Faxios
 *
 * @param {Object} instanceConfig The default config for the instance
 *
 * @return {Faxios} A new instance of Faxios
 */
class Faxios {
  defaults: FaxiosRequestConfig;
  interceptors: {
    request: {
      forEach: (
        fn: (h: {
          runWhen?: ((c: InternalFaxiosRequestConfig) => boolean) | null;
          synchronous?: boolean;
          fulfilled?: (...args: Array<unknown>) => unknown;
          rejected?: (...args: Array<unknown>) => unknown;
        }) => void
      ) => void;
    };
    response: {
      forEach: (
        fn: (h: {
          fulfilled?: (...args: Array<unknown>) => unknown;
          rejected?: (...args: Array<unknown>) => unknown;
        }) => void
      ) => void;
    };
  };
  #middleware: ReadonlyArray<MiddlewareEntry> = [];
  // Middleware and capabilities are replaced, never mutated, on use()/eject(): a request keeps the
  // snapshot it started with, and composes nothing per call.
  #composed: FaxiosNext | null = null;
  #capabilities: Record<string, unknown> = Object.create(null);

  constructor(instanceConfig?: FaxiosRequestConfig) {
    this.defaults = instanceConfig || {};
    this.interceptors = {
      request: new InterceptorManager(),
      response: new InterceptorManager(),
    };
  }

  /**
   * Register middleware or a plugin. Middleware runs in registration order before dispatch and in
   * reverse order after it. Returns the instance so calls can be chained.
   */
  use<TRequires = unknown, TProvides = unknown, TOptions = unknown>(
    middleware: FaxiosMiddleware<TOptions> | FaxiosPlugin<TRequires, TProvides, TOptions>
  ): this {
    const plugin = typeof middleware === "function" ? null : middleware;
    const run = plugin ? plugin.middleware : middleware;
    if (typeof run !== "function") {
      throw new FaxiosError("use() expects a middleware function or a plugin with a middleware function", FaxiosError.ERR_BAD_OPTION_VALUE);
    }
    const provided = plugin?.provides == null ? [] : this.#addCapabilities(plugin.name, plugin.provides);
    this.#setMiddleware([ ...this.#middleware, { ref: middleware, run: run as FaxiosMiddleware, provided }]);
    return this;
  }

  /** Remove middleware or a plugin registered with use(), by reference. In-flight requests are unaffected. */
  eject<TRequires = unknown, TProvides = unknown, TOptions = unknown>(
    middleware: FaxiosMiddleware<TOptions> | FaxiosPlugin<TRequires, TProvides, TOptions>
  ): void {
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
    this.#composed = entries.length === 0
      ? null
      : composeMiddleware(entries, ctx => this.#dispatch(copyForDispatch(ctx.config)) as Promise<FaxiosResponse>);
  }

  #addCapabilities(pluginName: string, provides: unknown): Array<string> {
    const source = provides as Record<string, unknown>;
    const keys = Object.keys(source).filter(key => !DANGEROUS_KEYS.has(key));
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
  async request<T = unknown, R = FaxiosResponse<T>, D = unknown>(configOrUrl: string | FaxiosRequestConfig<D>, config?: FaxiosRequestConfig<D>): Promise<R>;
  async request(
    configOrUrl: string | FaxiosRequestConfig,
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
    configOrUrl: string | FaxiosRequestConfig,
    config?: FaxiosRequestConfig
  ): Promise<unknown> {
    /*eslint no-param-reassign:0*/
    // Allow for faxios('example/url'[, config]) a la fetch API
    if (typeof configOrUrl === "string") {
      config = config || {};
      config.url = configOrUrl;
    }
    else {
      config = configOrUrl;
    }

    config = mergeConfig(this.defaults, config);

    const { transitional, headers } = config;

    if (transitional !== undefined) {
      validator.assertOptions(
        transitional,
        {
          silentJSONParsing: validators.transitional!(validators.boolean),
          forcedJSONParsing: validators.transitional!(validators.boolean),
          clarifyTimeoutError: validators.transitional!(validators.boolean),
          legacyInterceptorReqResOrdering: validators.transitional!(
            validators.boolean
          ),
          advertiseZstdAcceptEncoding: validators.transitional!(
            validators.boolean
          ),
          validateStatusUndefinedResolves: validators.transitional!(
            validators.boolean
          ),
        },
        false
      );
    }

    normalizeParamsSerializer(config);
    resolveAllowAbsoluteUrls(config, this.defaults);

    validator.assertOptions(
      config,
      {
        baseUrl: validators.spelling!("baseURL"),
        withXsrfToken: validators.spelling!("withXSRFToken"),
      },
      true
    );

    // Set config.method
    config.method = (
      (config.method || this.defaults.method || "get") as string
    ).toLowerCase();

    // Flatten headers
    // Every FaxiosConfigHeaders member is a string-keyed object, so this is a
    // checked widening, not an assertion: mergeConfig spreads a top-level
    // FaxiosHeaders, and method header groups are typed as plain header bags.
    const h: Record<string, unknown> | undefined = headers;
    let contextHeaders = h && utils.merge(h.common, h[config.method]);

    if (h) {
      for (const group of METHOD_HEADER_GROUPS) {
        delete h[group];
      }
    }

    config.headers = FaxiosHeaders.concat(
      contextHeaders,
      ...(h ? [ h as unknown as null ] : [])
    );

    const composed = this.#composed;
    if (!composed) return this.#dispatch(config);

    const ctx: FaxiosContext = {
      config: config as InternalFaxiosRequestConfig,
      state: Object.create(null),
      capabilities: this.#capabilities,
    };
    return composed(ctx);
  }

  // Until interceptors are removed (#89), they run inside the innermost next(): middleware wraps
  // request interceptors, dispatch and response interceptors as one unit.
  #dispatch(config: FaxiosRequestConfig): Promise<unknown> {
    const {
      chain: requestInterceptorChain,
      synchronous: synchronousRequestInterceptors,
    } = buildRequestInterceptorChain(this.interceptors.request, config);

    const responseInterceptorChain: Array<
      ((...args: Array<unknown>) => unknown) | undefined
    > = [];
    this.interceptors.response.forEach(
      function pushResponseInterceptors(interceptor: {
        fulfilled?: (...args: Array<unknown>) => unknown;
        rejected?: (...args: Array<unknown>) => unknown;
      }) {
        responseInterceptorChain.push(
          interceptor.fulfilled,
          interceptor.rejected
        );
      }
    );

    let promise;
    let i = 0;
    let len;

    if (!synchronousRequestInterceptors) {
      const chain: Array<((...args: Array<unknown>) => unknown) | undefined> = [
        dispatchRequest.bind(this) as (...args: Array<unknown>) => unknown,
        undefined,
      ];
      chain.unshift(...requestInterceptorChain);
      chain.push(...responseInterceptorChain);
      len = chain.length;

      promise = Promise.resolve(config) as Promise<unknown>;

      while (i < len) {
        promise = promise.then(chain[i++], chain[i++]);
      }

      return promise;
    }

    const newConfig = runSyncInterceptors(requestInterceptorChain, config, this);

    promise = dispatchRequest.call(this, newConfig as InternalFaxiosRequestConfig) as Promise<unknown>;

    len = responseInterceptorChain.length;

    while (i < len) {
      promise = promise.then(
        responseInterceptorChain[i++],
        responseInterceptorChain[i++]
      );
    }

    return promise;
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
    const fullPath = buildFullPath(
      config.baseURL,
      config.url,
      config.allowAbsoluteUrls,
      config
    );
    return buildURL(fullPath, config.params, config.paramsSerializer);
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

export default Faxios;
