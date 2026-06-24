"use strict";

import adapters from "./adapters/adapters.js";
import CanceledError from "./cancel/CanceledError.js";
import CancelToken from "./cancel/CancelToken.js";
import isCancel from "./cancel/isCancel.js";
import Faxios from "./core/Faxios.js";
import FaxiosError from "./core/FaxiosError.js";
import FaxiosHeaders from "./core/FaxiosHeaders.js";
import mergeConfig from "./core/mergeConfig.js";
import defaults from "./defaults/index.js";
import { VERSION } from "./env/data.js";
import bind from "./helpers/bind.js";
import formDataToJSON from "./helpers/formDataToJSON.js";
import HttpStatusCode from "./helpers/HttpStatusCode.js";
import isFaxiosError from "./helpers/isFaxiosError.js";
import spread from "./helpers/spread.js";
import toFormData from "./helpers/toFormData.js";
import type { FaxiosInterceptorHandler, FaxiosInterceptorOptions, FaxiosInterceptorRejected, FaxiosRequestConfig, InternalFaxiosRequestConfig, FaxiosResponse } from "./types.js";
import utils from "./utils.js";

/**
 * Create an instance of Faxios
 *
 * @param {Object} defaultConfig The default config for the instance
 *
 * @returns {Faxios} A new instance of Faxios
 */
function createInstance(defaultConfig: FaxiosRequestConfig): FaxiosInstance {
  const context = new Faxios(defaultConfig);
  const instance = bind(Faxios.prototype.request as (...args: Array<unknown>) => unknown, context) as unknown as FaxiosInstance;

  // Copy axios.prototype to instance
  utils.extend(instance, Faxios.prototype, context, { allOwnKeys: true });

  // Copy context to instance
  utils.extend(instance, context, null, { allOwnKeys: true });

  // Factory for creating new instances
  instance.create = function create(instanceConfig?: FaxiosRequestConfig): FaxiosInstance {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

export type FaxiosInstance = {
  (config: FaxiosRequestConfig): Promise<FaxiosResponse>;
  (url: string, config?: FaxiosRequestConfig): Promise<FaxiosResponse>;
  request: (config: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  get: (url: string, config?: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  delete: (url: string, config?: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  head: (url: string, config?: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  options: (url: string, config?: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  post: (url: string, data?: unknown, config?: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  put: (url: string, data?: unknown, config?: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  patch: (url: string, data?: unknown, config?: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  query: (url: string, data?: unknown, config?: FaxiosRequestConfig) => Promise<FaxiosResponse>;
  defaults: { headers: Record<string, unknown>; } & Record<string, unknown>;
  interceptors: {
    request: {
      use: (
        fulfilled: (config: InternalFaxiosRequestConfig) => InternalFaxiosRequestConfig | Promise<InternalFaxiosRequestConfig>,
        rejected?: FaxiosInterceptorRejected | null,
        options?: FaxiosInterceptorOptions
      ) => number;
      eject: (id: number) => void;
      clear: () => void;
      handlers: Array<FaxiosInterceptorHandler<InternalFaxiosRequestConfig> | null>;
    };
    response: {
      use: (
        fulfilled: (response: FaxiosResponse) => FaxiosResponse | Promise<FaxiosResponse> | unknown,
        rejected?: FaxiosInterceptorRejected | null,
        options?: FaxiosInterceptorOptions
      ) => number;
      eject: (id: number) => void;
      clear: () => void;
      handlers: Array<FaxiosInterceptorHandler<FaxiosResponse> | null>;
    };
  };
  getUri: (config?: FaxiosRequestConfig) => string;
  create: (instanceConfig?: FaxiosRequestConfig) => FaxiosInstance;
  Faxios: typeof Faxios;
  CanceledError: typeof CanceledError;
  CancelToken: typeof CancelToken;
  isCancel: typeof isCancel;
  VERSION: typeof VERSION;
  toFormData: typeof toFormData;
  FaxiosError: typeof FaxiosError;
  Cancel: typeof CanceledError;
  all: (promises: Array<Promise<unknown>>) => Promise<Array<unknown>>;
  spread: typeof spread;
  isFaxiosError: typeof isFaxiosError;
  mergeConfig: typeof mergeConfig;
  FaxiosHeaders: typeof FaxiosHeaders;
  formToJSON: (thing: unknown) => unknown;
  getAdapter: typeof adapters.getAdapter;
  HttpStatusCode: typeof HttpStatusCode;
  default: FaxiosInstance;
  [key: string]: unknown;
};

// Create the default instance to be exported
const axios = createInstance(defaults as unknown as FaxiosRequestConfig);

// Expose Faxios class to allow class inheritance
axios.Faxios = Faxios;

// Expose Cancel & CancelToken
axios.CanceledError = CanceledError;
axios.CancelToken = CancelToken;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData;

// Expose FaxiosError class
axios.FaxiosError = FaxiosError;

// alias for CanceledError for backward compatibility
axios.Cancel = axios.CanceledError;

// Expose all/spread
axios.all = async function all(promises: Array<Promise<unknown>>): Promise<Array<unknown>> {
  return Promise.all(promises);
};

axios.spread = spread;

// Expose isFaxiosError
axios.isFaxiosError = isFaxiosError;

// Expose mergeConfig
axios.mergeConfig = mergeConfig;

axios.FaxiosHeaders = FaxiosHeaders;

axios.formToJSON = (thing: unknown): unknown => formDataToJSON(utils.isHTMLForm(thing) ? ((): unknown => {
  const GlobalFormData = (globalThis as Record<string, unknown>)["FormData"] as (new (el?: unknown) => unknown) | undefined;
  return GlobalFormData ? new GlobalFormData(thing) : thing;
})() : thing);

axios.getAdapter = adapters.getAdapter;

axios.HttpStatusCode = HttpStatusCode;

axios.default = axios;

// this module should only have a default export
export default axios;
