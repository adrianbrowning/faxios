"use strict";

import transitionalDefaults from "../defaults/transitional.js";
import buildURL from "../helpers/buildURL.js";
import validator from "../helpers/validator.js";
import type { ValidatorFn } from "../helpers/validator.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import type {
  FaxiosRequestConfig,
  FaxiosResponse,
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

  constructor(instanceConfig?: FaxiosRequestConfig) {
    this.defaults = instanceConfig || {};
    this.interceptors = {
      request: new InterceptorManager(),
      response: new InterceptorManager(),
    };
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
    const h = headers;
    let contextHeaders = h && utils.merge(h.common, h[config.method]);

    h &&
      utils.forEach(
        [ "delete", "get", "head", "post", "put", "patch", "query", "common" ],
        method => {
          delete h[method as string];
        }
      );

    config.headers = FaxiosHeaders.concat(
      contextHeaders,
      ...(h ? [ h as unknown as null ] : [])
    );

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
