"use strict";

import transitionalDefaults from "../defaults/transitional.js";
import buildURL from "../helpers/buildURL.js";
import validator from "../helpers/validator.js";
import type { ValidatorFn } from "../helpers/validator.js";
import type {
  AxiosRequestConfig,
  InternalAxiosRequestConfig
} from "../types.js";
import utils from "../utils.js";
import AxiosHeaders from "./AxiosHeaders.js";
import buildFullPath from "./buildFullPath.js";
import dispatchRequest from "./dispatchRequest.js";
import InterceptorManager from "./InterceptorManager.js";
import mergeConfig from "./mergeConfig.js";

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

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 *
 * @return {Axios} A new instance of Axios
 */
class Axios {
  defaults: AxiosRequestConfig;
  interceptors: {
    request: {
      forEach: (
        fn: (h: {
          runWhen?: ((c: InternalAxiosRequestConfig) => boolean) | null;
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

  constructor(instanceConfig?: AxiosRequestConfig) {
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

  async request(
    configOrUrl: string | AxiosRequestConfig,
    config?: AxiosRequestConfig
  ) {
    try {
      return await this._request(configOrUrl, config);
    }
    catch (err) {
      if (err instanceof Error) {
        let dummy: { stack?: string; } = {};

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (Error.captureStackTrace) {
          Error.captureStackTrace(dummy);
        }
        else {
          dummy = new Error();
        }

        // slice off the Error: ... line
        const stack = (() => {
          if (!dummy.stack) {
            return "";
          }

          const firstNewlineIndex = dummy.stack.indexOf("\n");

          return firstNewlineIndex === -1
            ? ""
            : dummy.stack.slice(firstNewlineIndex + 1);
        })();
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

      throw err;
    }
  }

  async _request(
    configOrUrl: string | AxiosRequestConfig,
    config?: AxiosRequestConfig
  ) {
    /*eslint no-param-reassign:0*/
    // Allow for axios('example/url'[, config]) a la fetch API
    if (typeof configOrUrl === "string") {
      config = config || {};
      config.url = configOrUrl;
    }
    else {
      config = configOrUrl;
    }

    config = mergeConfig(this.defaults, config);

    const { transitional, paramsSerializer, headers } = config;

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

    if (paramsSerializer != null) {
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

    // Set config.allowAbsoluteUrls
    if (config.allowAbsoluteUrls !== undefined) {
      // do nothing
    }
    else if (this.defaults.allowAbsoluteUrls !== undefined) {
      config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
    }
    else {
      config.allowAbsoluteUrls = true;
    }

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

    config.headers = AxiosHeaders.concat(
      contextHeaders,
      ...(h ? [ h as unknown as null ] : [])
    );

    // filter out skipped interceptors
    const requestInterceptorChain: Array<
      ((...args: Array<unknown>) => unknown) | undefined
    > = [];
    let synchronousRequestInterceptors = true;
    this.interceptors.request.forEach(
      function unshiftRequestInterceptors(interceptor: {
        runWhen?: ((config: InternalAxiosRequestConfig) => boolean) | null;
        synchronous?: boolean;
        fulfilled?: (...args: Array<unknown>) => unknown;
        rejected?: (...args: Array<unknown>) => unknown;
      }) {
        if (
          typeof interceptor.runWhen === "function" &&
          interceptor.runWhen(config as InternalAxiosRequestConfig) === false
        ) {
          return;
        }

        synchronousRequestInterceptors =
          synchronousRequestInterceptors && !!interceptor.synchronous;

        const transitional = config.transitional || transitionalDefaults;
        const legacyInterceptorReqResOrdering =
          transitional.legacyInterceptorReqResOrdering;

        if (legacyInterceptorReqResOrdering) {
          requestInterceptorChain.unshift(
            interceptor.fulfilled,
            interceptor.rejected
          );
        }
        else {
          requestInterceptorChain.push(
            interceptor.fulfilled,
            interceptor.rejected
          );
        }
      }
    );

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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

    len = requestInterceptorChain.length;

    let newConfig = config;

    while (i < len) {
      const onFulfilled = requestInterceptorChain[i++];
      const onRejected = requestInterceptorChain[i++];
      try {
        newConfig = onFulfilled
          ? (onFulfilled(newConfig) as AxiosRequestConfig)
          : newConfig;
      }
      catch (error) {
        if (onRejected) onRejected.call(this, error);
        break;
      }
    }

    promise = Promise.resolve(newConfig as InternalAxiosRequestConfig).then(
      async cfg => dispatchRequest.call(this, cfg) as Promise<unknown>
    );

    i = 0;
    len = responseInterceptorChain.length;

    while (i < len) {
      promise = promise.then(
        responseInterceptorChain[i++],
        responseInterceptorChain[i++]
      );
    }

    return promise;
  }

  getUri(config?: AxiosRequestConfig) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(
      config.baseURL,
      config.url,
      config.allowAbsoluteUrls,
      config
    );
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
}

// Provide aliases for supported request methods
utils.forEach(
  [ "delete", "get", "head", "options" ],
  function forEachMethodNoData(method) {
    /*eslint func-names:0*/
    (Axios.prototype as unknown as Record<string, unknown>)[method as string] =
      async function (this: Axios, url: string, config?: AxiosRequestConfig) {
        return this.request(
          mergeConfig(config || {}, {
            method: method as string,
            url,
            data:
              config && utils.hasOwnProp(config, "data")
                ? config.data
                : undefined,
          })
        );
      };
  }
);

utils.forEach(
  [ "post", "put", "patch", "query" ],
  function forEachMethodWithData(method) {
    function generateHTTPMethod(isForm?: boolean) {
      return async function httpMethod(
        this: Axios,
        url: string,
        data?: unknown,
        config?: AxiosRequestConfig
      ) {
        return this.request(
          mergeConfig(config || {}, {
            method: method as string,
            headers: isForm
              ? {
                "Content-Type": "multipart/form-data",
              }
              : {},
            url,
            data,
          })
        );
      };
    }

    (Axios.prototype as unknown as Record<string, unknown>)[method as string] =
      generateHTTPMethod();

    // QUERY is a safe/idempotent read method; multipart form bodies don't fit
    // its semantics, so no queryForm shorthand is generated.
    if (method !== "query") {
      (Axios.prototype as unknown as Record<string, unknown>)[
        (method as string) + "Form"
      ] = generateHTTPMethod(true);
    }
  }
);

export default Axios;
